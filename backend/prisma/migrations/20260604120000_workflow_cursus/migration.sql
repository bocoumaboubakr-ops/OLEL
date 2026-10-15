-- Cursus d'alerte complet (CURSUS_ALERTE.md) : étapes, rôles étendus, validations enrichies

-- Nouveaux rôles
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GOUVERNORAT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PROTECTION_CIVILE';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

-- Nouveaux statuts d'alerte
ALTER TYPE "AlertStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "AlertStatus" ADD VALUE IF NOT EXISTS 'VALIDATED';
ALTER TYPE "AlertStatus" ADD VALUE IF NOT EXISTS 'BROADCASTING';
ALTER TYPE "AlertStatus" ADD VALUE IF NOT EXISTS 'BROADCAST';
ALTER TYPE "AlertStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "AlertStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

-- Étapes du cursus
DO $$ BEGIN
  CREATE TYPE "AlertStep" AS ENUM ('SIGNALEMENT', 'SENTINELLE', 'MAIRIE', 'PREFECTURE', 'BROADCAST', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Action de validation
DO $$ BEGIN
  CREATE TYPE "ValidationAction" AS ENUM ('VALIDATED', 'REJECTED', 'ESCALATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Colonnes Alert
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "currentStep" "AlertStep" NOT NULL DEFAULT 'SIGNALEMENT';
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "broadcastAt" TIMESTAMP(3);
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "closureReason" TEXT;
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "requiresMedicalReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "requiresConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "consentObtained" BOOLEAN NOT NULL DEFAULT false;

-- Colonnes Validation
ALTER TABLE "validations" ADD COLUMN IF NOT EXISTS "action" "ValidationAction";
ALTER TABLE "validations" ADD COLUMN IF NOT EXISTS "step" "AlertStep";
ALTER TABLE "validations" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "validations" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "validations" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "validations" ADD COLUMN IF NOT EXISTS "gravity" INTEGER;

-- Autoriser plusieurs validations par alerte (une par étape)
ALTER TABLE "validations" DROP CONSTRAINT IF EXISTS "validations_alertId_validatorId_key";
CREATE INDEX IF NOT EXISTS "validations_alertId_createdAt_idx" ON "validations" ("alertId", "createdAt");
