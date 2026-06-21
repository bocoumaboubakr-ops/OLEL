-- v3 workflow: bypass urgence + auto-escalade
ALTER TABLE "alerts" ADD COLUMN "emergencyBypass" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "alerts" ADD COLUMN "bypassJustification" TEXT;
ALTER TABLE "alerts" ADD COLUMN "bypassById" TEXT;
ALTER TABLE "alerts" ADD COLUMN "autoEscalated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "alerts" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "alerts" ADD COLUMN "citizensNotifiedAt" TIMESTAMP(3);
ALTER TABLE "alerts"
  ADD CONSTRAINT "alerts_bypassById_fkey"
  FOREIGN KEY ("bypassById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Opt-out RGPD non bloquant (remplace le filtre consent strict)
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "optedOut" BOOLEAN NOT NULL DEFAULT false;

-- Normalisation des alertes existantes : aligner les vieux steps sur les phases v3
UPDATE "alerts" SET "currentStep" = 'SIGNALEMENT' WHERE "currentStep" = 'SENTINELLE';
UPDATE "alerts" SET "currentStep" = 'MAIRIE'      WHERE "currentStep" = 'COORDINATEUR';
UPDATE "alerts" SET "currentStep" = 'PREFECTURE'  WHERE "currentStep" = 'GOUVERNANCE';
