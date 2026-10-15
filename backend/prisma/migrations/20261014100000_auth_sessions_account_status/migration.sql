-- Lot A1 (audit F01/F07/F11/F19) : statut de compte, version de jetons,
-- sessions de rafraîchissement révocables, verrouillages persistés.
-- Migration additive : aucune colonne ni donnée supprimée.

CREATE TYPE "AccountStatus" AS ENUM ('IN_TRAINING', 'ACTIVE', 'SUSPENDED');

ALTER TABLE "users"
  ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totpPendingSecret" TEXT,
  ADD COLUMN "loginFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loginLockedUntil" TIMESTAMP(3),
  ADD COLUMN "mfaFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mfaLockedUntil" TIMESTAMP(3),
  ADD COLUMN "trainingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "habilitatedAt" TIMESTAMP(3),
  ADD COLUMN "habilitatedById" TEXT;

-- Rétro-remplissage prudent : un compte inactif devient SUSPENDED (aucun
-- accès). On ne peut pas distinguer a posteriori une sentinelle « en attente
-- de formation » d'une sentinelle suspendue : un responsable la repasse en
-- IN_TRAINING explicitement. Les comptes actifs existants sont considérés
-- comme habilités à la date de la migration.
UPDATE "users" SET "status" = 'SUSPENDED' WHERE "isActive" = false;
UPDATE "users" SET "habilitatedAt" = CURRENT_TIMESTAMP
  WHERE "isActive" = true AND "role" <> 'CITOYEN';

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mfa" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "replacedById" TEXT,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les OTP stockés en clair avant cette migration sont invalidés : la colonne
-- "code" contient désormais un HMAC (voir auth.service.ts).
UPDATE "otp_requests" SET "used" = true WHERE "used" = false;
