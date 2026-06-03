# OLEL — Tester sur ton téléphone + ton ordinateur (même WiFi)

L'objectif : ton ordi héberge l'API + le dashboard + l'app mobile ; ton téléphone se connecte
au PC via le WiFi pour ouvrir l'app dans son navigateur (comme une vraie utilisation terrain).

> **Prérequis** : téléphone et PC sur **le même réseau WiFi**.

---

## 1. Trouver l'IP locale de ton ordinateur

### Windows
Ouvre **PowerShell** et lance :

```powershell
ipconfig | findstr IPv4
```

Tu obtiens une ligne du style `Adresse IPv4. . . . . . . . . . . : 192.168.1.42`.
Cette IP (ici **192.168.1.42**) est ce que tu vas taper sur le téléphone.
Note-la — on l'appellera `IP_PC` dans la suite.

### macOS / Linux

```bash
ip route get 1 | awk '{print $7; exit}'   # Linux
ipconfig getifaddr en0                    # macOS WiFi
```

---

## 2. Ouvrir le pare-feu Windows pour les 3 ports

Une seule fois, dans une **PowerShell admin** :

```powershell
New-NetFirewallRule -DisplayName "OLEL API"       -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow
New-NetFirewallRule -DisplayName "OLEL Dashboard" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
New-NetFirewallRule -DisplayName "OLEL Mobile"    -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

(Sur Mac/Linux le pare-feu local laisse passer par défaut.)

---

## 3. Démarrer la pile sur l'ordinateur

Deux façons : **Docker** (tout-en-un) ou **pnpm dev** (plus rapide à itérer).

### Option A — Docker Compose (recommandée pour tester)

```bash
cd C:\Users\INCUBATEUR NGARTAM\Documents\Claude\Projects\OLEL
copy .env.example .env                 # Windows ; sur mac/linux : cp .env.example .env
docker compose up --build
```

Une fois prêt :

- API → http://IP_PC:4000/api/v1
- Swagger → http://IP_PC:4000/api/docs
- Dashboard → http://IP_PC:3000
- Mobile → http://IP_PC:3001

Seed (une fois, dans un autre terminal) :

```bash
docker compose exec backend npm run db:seed
```

### Option B — pnpm dev (sans Docker)

Installe d'abord la base + Redis localement (Postgres 15 + PostGIS, Redis 7) puis :

```bash
cd C:\Users\INCUBATEUR NGARTAM\Documents\Claude\Projects\OLEL
pnpm install
pnpm --filter @olel/ui build

# Terminal 1 : backend (port 4000, écoute 0.0.0.0)
cd backend
npx prisma generate
npx prisma db push
npm run db:seed
pnpm dev

# Terminal 2 : dashboard (port 3000)
pnpm --filter @olel/dashboard dev

# Terminal 3 : mobile (port 3001) — pointe vers l'API LAN
# Remplace 192.168.1.42 par ton IP_PC
set NEXT_PUBLIC_API_URL=http://192.168.1.42:4000   ::Windows cmd
$env:NEXT_PUBLIC_API_URL="http://192.168.1.42:4000" # PowerShell
export NEXT_PUBLIC_API_URL=http://192.168.1.42:4000  # mac/linux
pnpm --filter @olel/mobile dev
```

Next.js écoute automatiquement sur `0.0.0.0` en dev — accessible depuis le téléphone.

---

## 4. Sur le téléphone

Ouvre **Chrome** (ou Safari sur iPhone) et tape :

| Interface             | URL à saisir                  |
|-----------------------|-------------------------------|
| **App citoyen/sentinelle** | `http://IP_PC:3001`     |
| **Centre de commandement**  | `http://IP_PC:3000`    |
| **API / Swagger**           | `http://IP_PC:4000/api/docs` |

> Remplace `IP_PC` par l'IP trouvée à l'étape 1 (ex. `http://192.168.1.42:3001`).

### Connexion mobile (écran login OTP)
1. Saisis ton numéro (ou un numéro de démo, ex. `+221700000020`).
2. Code OTP en mode dev : **`000000`**.
3. Choisis ta zone, tu arrives sur l'écran d'accueil.

### Pour tester le rôle Sentinelle (file + équipe + vérification terrain)
Avec un compte démo Sentinelle, tu auras accès à `/sentinel` :
- 📋 **File à vérifier** — signalements triés urgence + proximité GPS
- 👥 **Équipe** — coéquipiers de ta zone + canal messages
- 🎓 Formations / 🎯 Missions

> Sur iOS, autorise la géolocalisation et le micro quand le navigateur le demande.

---

## 5. Comptes de démo (après seed)

| Rôle        | Téléphone        | Code OTP (dev) |
|-------------|------------------|----------------|
| Super admin | +221700000000    | 000000         |
| Préfecture  | +221700000001    | 000000         |
| Mairie      | +221700000002    | 000000         |
| Sentinelle  | +221700000010    | 000000         |
| Citoyen     | +221700000020    | 000000         |

Mot de passe (dashboard) : valeurs par défaut surchargeables via `SEED_*_PASSWORD`
(voir DEMARRAGE.md). Ces comptes sont créés par `npm run db:seed` côté backend.

---

## 6. Dépannage rapide

| Symptôme                                  | Cause probable                                     | Fix |
|-------------------------------------------|----------------------------------------------------|------|
| Téléphone "Connexion refusée"             | Pare-feu Windows                                   | Re-lance les `New-NetFirewallRule` (étape 2) |
| App mobile s'ouvre mais reste sur Login   | `NEXT_PUBLIC_API_URL` non défini ou pointe sur localhost | Reconfigure et redémarre `pnpm --filter @olel/mobile dev` |
| Erreur CORS dans la console               | Backend démarré avant la variable d'env            | Vérifie `WS_PUBLIC_ORIGIN` / redémarre le backend |
| Géoloc / Caméra refusées sur iOS          | iOS exige HTTPS hors `localhost`                   | Utilise un tunnel (`ngrok http 3001`) — voir ci-dessous |
| `prisma migrate dev` veut une migration   | Mode dev rapide                                    | Utilise `npx prisma db push` à la place |
| `docker compose up` reste bloqué          | Port 5432/6379 déjà pris par Postgres/Redis local  | Stoppe le service local ou change le port dans `docker-compose.yml` |

### Bonus : HTTPS pour téléphone (caméra + GPS iOS)
iOS bloque caméra et géoloc précise hors HTTPS. Pour tester ces fonctions sur iPhone :

```bash
npm i -g ngrok
ngrok http 3001
```

`ngrok` te donne une URL `https://xxxx.ngrok.io` à ouvrir sur le téléphone.
Dans ce cas, expose aussi l'API : `ngrok http 4000` (URL différente) et lance le mobile avec
`NEXT_PUBLIC_API_URL=<URL ngrok API>`.

---

## 7. Vérification rapide (smoke test 30s)

Depuis le téléphone :
1. `http://IP_PC:3001` → écran Login
2. Numéro `+221700000020` → code `000000` → choisir une zone
3. Bouton **Signaler** → choisir un type de risque → décrire → envoyer
4. Sur l'ordinateur : `http://IP_PC:3000/dashboard/alerts` → ton signalement apparaît live (WebSocket)
5. Reconnecte-toi en sentinelle (`+221700000010`) → **File à vérifier** → ton signalement → boutons GPS + Photo + Gravité + Valider

Si tout fonctionne, la boucle citoyen → sentinelle → dashboard est opérationnelle bout-à-bout.

---

*Voir aussi : `DEMARRAGE.md` (installation détaillée), `GUIDE_DEPLOIEMENT.md` (prod VPS),
`apps/mobile/CAPACITOR.md` (packaging APK Android / iOS).*
