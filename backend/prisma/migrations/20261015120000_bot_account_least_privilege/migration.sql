-- Moindre privilège : le compte technique « BOT OLEL » sert uniquement
-- d'auteur aux signalements reçus sans numéro. Il n'a pas de mot de passe et
-- n'a aucune raison d'être ADMIN. Réversible (UPDATE inverse).
UPDATE "users" SET "role" = 'CITOYEN', "updatedAt" = now()
WHERE "name" = 'BOT OLEL' AND "role" = 'ADMIN' AND "passwordHash" IS NULL;
