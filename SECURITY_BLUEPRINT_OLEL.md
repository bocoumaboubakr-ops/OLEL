# OLEL — Security Blueprint Zero Trust

**Posture** : OLEL est une infrastructure critique d'alerte en situation de catastrophe. Une compromission peut empêcher la diffusion d'alertes (vies en jeu) ou pousser de fausses alertes (panique). Niveau de sécurité visé : **adapté aux institutions publiques, organisations internationales (ONU, UE), collectivités territoriales**.

**Principe** : Zero Trust. Aucun composant ne fait confiance à un autre par défaut. Chaque requête est authentifiée, autorisée, journalisée.

---

## 1. Modèle de menace (STRIDE par composant)

### 1.1 — Mobile (citoyens, sentinelles)
| Catégorie | Menace | Mitigation |
|---|---|---|
| Spoofing | Téléphone volé → faux signalements | Logout auto inactivité 30 min, MFA pour sentinelles |
| Tampering | App modifiée (rooted Android) | Code obfuscation Capacitor + intégrité runtime |
| Repudiation | Sentinelle nie avoir validé | Audit log signé, IP + appareil |
| Information disclosure | Photo signalement publique | Bucket privé MinIO, URLs signées TTL 1h |
| Denial of service | Spam signalements | Rate limit IP/MSISDN |
| Elevation of privilege | Citoyen accède au dashboard | RBAC strict + check rôle dans chaque endpoint |

### 1.2 — Backend API
| Menace | Mitigation |
|---|---|
| SQL injection | Prisma ORM paramétré |
| NoSQL injection | N/A (pas de Mongo) |
| XSS | React échappe par défaut + CSP strict |
| CSRF | API stateless JWT + SameSite=Strict cookies |
| SSRF | Pas d'URLs user → fetch backend |
| Mass assignment | DTOs whitelistés (class-validator) |
| Broken auth | bcrypt 12 rounds, refresh rotation, 2FA |
| Broken access control | RolesGuard + check zone ownership |
| Outdated deps | Renovate + `pnpm audit` en CI |

### 1.3 — WhatsApp Bot
| Menace | Mitigation |
|---|---|
| Webhook spoofing | HMAC X-Hub-Signature-256 (✅ S-02) |
| Replay attack | Timestamp check + dedup ID |
| Message poisoning (prompt injection si IA) | Pas d'IA en MVP ; templates validés Meta |
| Compte WhatsApp suspendu | Templates conformes + monitoring proactif |

### 1.4 — USSD / SMS / IVR
| Menace | Mitigation |
|---|---|
| SIM swap pour usurper sentinelle | MFA TOTP obligatoire pour sentinelles |
| Faux numéros (caller ID spoofing) | Africa's Talking valide MSISDN ; pas confiance aveugle |
| SMS bombing | Rate limit OTP 3/min/numéro |
| USSD session hijack | Sessions opérateur stateful, courtes (< 60s) |

### 1.5 — Infrastructure (VPS, Docker)
| Menace | Mitigation |
|---|---|
| SSH brute force | Fail2ban + clé only + port non-22 + Wireguard |
| Container escape | Pas de --privileged ; user non-root dans containers |
| Image supply chain | Pin tags + scan Trivy + signature Cosign |
| Postgres exposé Internet | Bind 127.0.0.1 + accès via WireGuard pour admin |
| Volumes non chiffrés | LUKS sur partition data |

### 1.6 — Réseau
| Menace | Mitigation |
|---|---|
| DDoS L7 | Cloudflare WAF + rate limit |
| DDoS L3/L4 | Cloudflare Magic Transit (V2 si besoin) |
| MITM TLS | TLS 1.3 only, HSTS preload, OCSP stapling |
| DNS hijack | DNSSEC sur olel.sn + CAA records |

### 1.7 — Données
| Menace | Mitigation |
|---|---|
| Vol backup | Chiffrement avant upload (gpg --symmetric) |
| Exfiltration via API | Rate limit + audit log + alerting sur exports volumineux |
| Suppression accidentelle | Soft delete + backup 30j + DR (PRA) |

---

## 2. Architecture Zero Trust

```
                              ┌────────────────────┐
                              │  Identité          │
                              │  (Vault)           │
                              └────────┬───────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
        ┌─────────────────┐   ┌──────────────┐   ┌─────────────────┐
        │  Citoyen (PWA)  │   │  Sentinelle  │   │  Préfet (Dash)  │
        │  JWT 1h         │   │  JWT + TOTP  │   │  JWT + TOTP +   │
        │                 │   │              │   │  device pinning │
        └────────┬────────┘   └──────┬───────┘   └────────┬────────┘
                 │                   │                    │
                 └──────────┬────────┴────────────────────┘
                            ▼
              ┌──────────────────────────┐
              │  Cloudflare WAF + Rate   │
              │  limit (IP, route, user) │
              └────────┬─────────────────┘
                       │
              ┌──────────────────────────┐
              │  Nginx + mTLS interne    │
              └────────┬─────────────────┘
                       │
              ┌──────────────────────────┐
              │  Backend NestJS          │
              │  ├─ JwtAuthGuard         │
              │  ├─ RolesGuard           │
              │  ├─ ThrottlerGuard       │
              │  ├─ ZoneOwnerGuard       │
              │  └─ AuditInterceptor     │
              └────────┬─────────────────┘
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
   Postgres (TLS)  Redis (AUTH)   MinIO (URL signée)
```

**Règles Zero Trust appliquées** :
- Aucun service backend ne fait confiance à une requête sans JWT valide (sauf `/health` et `/metrics` derrière auth Prometheus).
- Aucune lecture/écriture sur une zone sans vérification que `user.zoneId == request.zoneId` ou rôle supérieur.
- Tous les services internes (backend, bot, MinIO) communiquent en TLS dans le réseau Docker.
- Postgres et Redis sur 127.0.0.1 + UNIX socket — pas exposés réseau.
- VPS accessible uniquement via WireGuard (VPN) pour SSH admin.

---

## 3. IAM (Identity & Access Management)

### 3.1 — Identités humaines
- **Citoyen** : phone OTP, JWT 1h, refresh 7j, pas de MFA (UX prime).
- **Sentinelle** : phone OTP + TOTP optionnel V0 / **obligatoire V1**, JWT 1h, refresh 7j.
- **Mairie / Préfecture / Gouvernorat / Protection civile** : login mot de passe + **TOTP OBLIGATOIRE**, JWT 1h, refresh 24h, **device pinning** (fingerprint navigateur).
- **Super admin** : idem + **YubiKey FIDO2** recommandée V1, sessions tracées en SIEM.

### 3.2 — Identités machines
- **Bot WhatsApp → Backend** : `BOT_API_KEY` (32+ chars, rotable mensuel) → échange contre JWT court 24h (`POST /auth/service-token`).
- **Cron jobs → Backend** : service token dédié, scope limité.
- **Backend → Postgres** : utilisateur DB dédié, droits limités (pas de DROP).
- **Backend → Redis** : password Redis (`requirepass`) + ACL (lecture seule sur certaines clés).

### 3.3 — Identités fédérées (V2)
- SSO ADFS / Keycloak pour ministères.
- OAuth Google pour ONG partenaires.

---

## 4. RBAC (Role-Based Access Control)

### 4.1 — Matrice rôles × ressources

| Ressource | CITOYEN | SENTINELLE | MAIRIE | PREFECTURE | GOUVERNORAT | PROTECTION_CIVILE | SUPER_ADMIN |
|---|---|---|---|---|---|---|---|
| Créer alerte | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lire alerte (sa zone) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lire alerte (toutes zones) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Valider/rejeter alerte | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Diffuser broadcast | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Créer utilisateur SENTINELLE | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Créer utilisateur MAIRIE+ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Créer utilisateur SUPER_ADMIN | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Voir audit log | ❌ | ❌ | ✅ (sa zone) | ✅ (sa préfecture) | ✅ | ✅ | ✅ |
| Modifier zones | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Modifier templates broadcast | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Exporter données RGPD | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 4.2 — Implémentation
- Décorateurs `@SentinelUp()`, `@MairieUp()`, `@PrefetUp()`, `@AdminOnly()` (existent déjà).
- **Ajouter** : `@ZoneOwnerGuard` qui check `request.zoneId == user.zoneId OR user.role >= MAIRIE`.
- **Ajouter** : `@RequireTwoFa` qui bloque si rôle ≥ MAIRIE et `!user.totpEnabled`.

---

## 5. MFA (Multi-Factor Authentication)

### 5.1 — Politique
- **CITOYEN** : pas de MFA (OTP suffit).
- **SENTINELLE** : TOTP optionnel V0, obligatoire V1.
- **MAIRIE+** : TOTP obligatoire dès V0.
- **SUPER_ADMIN** : TOTP + YubiKey FIDO2 obligatoire V1.

### 5.2 — Récupération
- 10 codes de récupération à usage unique (générés à l'enrôlement, à imprimer).
- Procédure manuelle SUPER_ADMIN pour reset TOTP (avec preuve d'identité, journalisée).

### 5.3 — Implémentation actuelle
- `totpSecret` chiffré AES-256-GCM ✅
- Enable/confirm endpoint ✅
- **À ajouter** : middleware `RequireTwoFaMiddleware` qui bloque tant que pas enrôlé pour rôles concernés.

---

## 6. Chiffrement

### 6.1 — En transit
- **Externe** : TLS 1.3 only, certificats Let's Encrypt auto-renouvelés (90j).
- **HSTS preload** : `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
- **OCSP stapling** Nginx.
- **Interne Docker** : mTLS entre services (cert-manager interne).

### 6.2 — Au repos
- **Postgres** : LUKS sur partition `/var/lib/postgresql/data`.
- **Backups** : chiffrement GPG symétrique (passphrase dans Vault) avant upload Wasabi.
- **MinIO** : SSE-S3 (server-side encryption avec clé chiffrée dans Vault).
- **TOTP secrets** : AES-256-GCM (✅ S-04).
- **Vault** : Shamir 5/3 unsealing.

### 6.3 — Clés gérées
| Clé | Rotation | Stockage |
|---|---|---|
| TLS Let's Encrypt | 90j auto | Filesystem chroot certbot |
| JWT_SECRET | Trimestriel | Vault |
| TOTP_ENCRYPTION_KEY | Annuel | Vault (rotation = re-encrypt) |
| BOT_API_KEY | Mensuel | Vault |
| Postgres password | Semestriel | Vault |
| LUKS passphrase | Annuel | Vault |
| Backup GPG passphrase | Annuel | Vault |
| WhatsApp app secret | Sur breach Meta | Vault |
| FCM server key | Annuel | Vault |

---

## 7. Gestion des secrets

### 7.1 — Stack recommandée
- **HashiCorp Vault** self-hosted (gratuit Open Source).
- **Alternative simple V0** : SOPS + age (chiffrement de `.env.prod` versionné dans Git).

### 7.2 — Workflow
- Dev local : `.env` non versionné, valeurs dev-only.
- CI : secrets GitHub Actions (encryption native).
- Staging/Prod : Vault → injection au démarrage container via `vault-agent`.

### 7.3 — Audit secret rotation
- Cron mensuel `scripts/rotate-secrets.sh` audite l'âge de chaque secret.
- Alerte Telegram OPS si secret > 90j et politique exige rotation.

---

## 8. WAF (Web Application Firewall)

### 8.1 — Cloudflare gratuit (V0)
Règles activées :
- OWASP Core Rule Set
- Block tor exit nodes (option)
- Challenge captcha si threat score > 50
- Bot Fight Mode
- Rate limit : 100 req/min/IP sur `/auth/*`
- Custom rules : block User-Agent vides, block méthodes HTTP atypiques

### 8.2 — Règles spécifiques OLEL
- POST `/auth/otp/request` : max 5 req/IP/h
- POST `/alerts` : max 30 req/IP/h
- GET `/alerts` : max 1000 req/IP/h

---

## 9. Protection DDoS

### 9.1 — Niveau Cloudflare gratuit (suffit MVP)
- Anycast global = absorption L3/L4.
- L7 : WAF + rate limit.
- "Under Attack Mode" déclenchable manuellement (challenge JS sur toute requête).

### 9.2 — Si attaque sévère (V1)
- Upgrade Cloudflare Pro (20 $/mo) : WAF avancé, image optim, rules custom.
- Activer Cloudflare Magic Transit (BGP) en cas d'attaque sustained.

---

## 10. SIEM (Security Information & Event Management)

### 10.1 — V0 — Logs centralisés Loki
- Promtail sur chaque conteneur → Loki.
- Grafana avec 3 dashboards sécurité :
  - Échecs auth (par IP, par compte)
  - Requêtes anormales (404, 5xx)
  - Évolution audit log (events RGPD)

### 10.2 — V1 — Wazuh self-hosted
- HIDS (host intrusion detection) sur VPS.
- File integrity monitoring (FIM) sur `/etc`, `/var/www`, binaires Docker.
- Détection rootkits.

### 10.3 — V2 — SOC externalisé
- Prestataire africain CSIRT (ex. CSIRT.sn) ou international (Sekoia, CrowdStrike).
- 24/7 monitoring + réponse incident.

---

## 11. Gestion des vulnérabilités

### 11.1 — Dépendances applicatives
- **GitHub Dependabot** actif (PRs auto pour MAJ deps).
- **`pnpm audit`** en CI bloquant sur high/critical.
- **Snyk** ou **Mend** gratuit pour repo public.

### 11.2 — Conteneurs
- **Trivy** scan des images Docker dans CI.
- Pin tags exacts (pas `:latest`).
- Signature Cosign V1.

### 11.3 — Système d'exploitation VPS
- `unattended-upgrades` configuré (security only).
- Reboot mensuel programmé maintenance.

### 11.4 — Pen-test
- Externe : bug bounty sur HackerOne ou intigriti, ouvert V2.
- Interne : sprint dédié pen-test avant V1 (à confier à un cabinet local).

---

## 12. Audit & journalisation

### 12.1 — Audit log applicatif
- ✅ Modèle `AuditLog` existe.
- ✅ `AuditService` injecté.
- **À étendre** : 
  - Tous endpoints `PATCH`, `DELETE`, `POST` sur ressources sensibles
  - Capturer : `actor`, `action`, `resourceType`, `resourceId`, `oldValue`, `newValue`, `ip`, `userAgent`, `timestamp`
  - Champ `correlationId` pour tracer une requête à travers les services
- **UI à créer** : page `/dashboard/admin/audit` (filtres, export CSV).
- **Rétention** : 5 ans (exigence loi sénégalaise).

### 12.2 — Logs serveur
- Format JSON structuré (Pino).
- Niveau prod : INFO (DEBUG seulement sur incident).
- Champs : `traceId`, `userId`, `path`, `method`, `status`, `duration`, `clientIp`.
- Pas de PII dans les logs (pas de mots de passe, OTP, contenu signalement).

### 12.3 — Alerting sur événements sécurité
- > 5 échecs login sur même compte → Telegram OPS
- Création compte SUPER_ADMIN → Telegram OPS
- Export massif données → Telegram OPS
- Modification audit log (impossible mais détection tentative)
- Échec MFA répété → blocage compte + Telegram

---

## 13. SOC (Security Operations Center)

### 13.1 — V0 (équipe interne)
- 1 SecOps dans l'équipe OLEL.
- Bastreaute incident hebdo.
- Astreinte : 1 personne, semaine glissante.

### 13.2 — V1 (extension)
- 2 SecOps.
- Astreinte 24/7 sur incidents P1+.
- Runbook formalisé par type d'incident (cf. RUNBOOK.md).

### 13.3 — V2 (externalisé)
- Contrat MSSP (Managed Security Service Provider).
- SLA 15 min réponse P1.

---

## 14. Gestion d'incidents

### 14.1 — Classification
| Sévérité | Définition | Délai réponse | Délai résolution |
|---|---|---|---|
| P1 — Critique | Service down OU données compromises | 15 min | 4h |
| P2 — Majeur | Fonction critique dégradée (broadcast échoue) | 1h | 24h |
| P3 — Mineur | Fonction non-critique en erreur | 4h | 72h |
| P4 — Cosmétique | UI bug, typo | 24h | next sprint |

### 14.2 — Workflow
1. Détection (alerting Sentry, UptimeRobot, ou utilisateur)
2. Triage (1 SecOps + 1 SRE on-call)
3. Communication (status.olel.sn — à créer V1)
4. Mitigation
5. Post-mortem (P1/P2) sous 5j ouvrés

### 14.3 — Templates communication
- Détection → "Nous enquêtons sur un incident affectant X. Mise à jour dans 30 min."
- Mitigation → "Nous avons identifié la cause. Résolution en cours."
- Résolution → "Incident résolu. Post-mortem à venir."

---

## 15. Conformité légale (résumé sécurité)

| Norme | Pertinence OLEL | Action |
|---|---|---|
| Loi sénégalaise 2008-12 | OBLIGATOIRE | Déclaration CDP, DPO, mentions |
| RGPD | Utile pour partenaires UE/ONU | Privacy policy, droit à l'oubli, DPA fournisseurs |
| ISO 27001 | Pas obligatoire MVP, viser V2 | Roadmap : politique sécurité, SoA, audit interne |
| NIST CSF | Référence framework | Mapper actions sur Identify/Protect/Detect/Respond/Recover |
| WCAG 2.1 AA | Loi accessibilité Sénégal en préparation | Audit a11y avant V1 |

---

## 16. Tableau récapitulatif des chantiers sécurité

| Item | Priorité | Sprint | Effort |
|---|---|---|---|
| MFA obligatoire MAIRIE+ | P0 | 1 | 1 j |
| Rate limit OTP | P0 | 1 | 0.5 j |
| Lockout compte | P0 | 1 | 0.5 j |
| Idempotency-Key | P0 | 1 | 1 j |
| Politique mots de passe (zxcvbn + HIBP) | P0 | 1 | 1 j |
| Cloudflare WAF activation | P0 | 0 | 0.5 j |
| Cloudflare DDoS basique | P0 | 0 | inclus WAF |
| Secrets Vault / SOPS | P0 | 0 | 2 j |
| Backups chiffrés daily | P0 | 1 | 1 j |
| Test restore backup | P0 | 1 | 0.5 j |
| LUKS sur partition data | P1 | 0 | 1 j |
| CORS strict prod | P0 | 1 | 0.5 j |
| Pin tags Docker + Trivy CI | P1 | 4 | 1 j |
| Audit log viewer UI | P1 | 3 | 2 j |
| Page admin audit | P1 | 3 | 1 j |
| Dependabot + pnpm audit CI | P1 | 0 | 0.5 j |
| HSTS preload | P0 | 0 | 0.5 j |
| Sentry intégré | P0 | 4 | 1.5 j |
| Loki + Grafana sécurité | P1 | 4 | 2 j |
| Wazuh HIDS | P2 | V1 | 2 j |
| Pen-test externe | P1 | V1 | 5 j (prestataire) |
| Soft delete + export RGPD | P1 | 3 | 2 j |
| Consent management | P0 | 3 | 2 j |
| DPO désigné | P0 | 0 | externe |
| Privacy policy + ToS | P0 | 3 | 2 j (avocat) |
| Déclaration CDP | P0 | 0 | externe |
| Runbook incident | P0 | 4 | 1 j |
| Astreinte 1ʳᵉ équipe | P0 | 5 | organisation |

**Total estimé sécurité** : ~25 j × dev × sprint, soit ~5 j/sprint dédiés à un développeur. Réaliste.

---

## Conclusion

Aucun raccourci n'est acceptable sur les items P0. Ils doivent être livrés AVANT le pilote Matam.

Les P1 doivent être planifiés mais peuvent glisser de 1 sprint si nécessaire.

Toute exception aux règles ci-dessus doit être documentée par écrit (Architecture Decision Record) et validée par le comité de pilotage.
