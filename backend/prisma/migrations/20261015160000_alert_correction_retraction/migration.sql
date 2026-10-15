-- Rectificatif et retrait d'une alerte diffusée (décision D11). Additive.
ALTER TYPE "BroadcastKind" ADD VALUE IF NOT EXISTS 'CORRECTION';
ALTER TYPE "BroadcastKind" ADD VALUE IF NOT EXISTS 'RETRACTION';
ALTER TYPE "BroadcastCertainty" ADD VALUE IF NOT EXISTS 'CORRECTION';
ALTER TYPE "BroadcastCertainty" ADD VALUE IF NOT EXISTS 'RETRACTION';

-- Plusieurs rectificatifs possibles : unicité par (alerte, nature, rang)
ALTER TABLE "broadcasts" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "broadcasts_alertId_kind_key";
CREATE UNIQUE INDEX "broadcasts_alertId_kind_sequence_key" ON "broadcasts"("alertId", "kind", "sequence");

ALTER TABLE "alerts"
  ADD COLUMN "retractedAt" TIMESTAMP(3),
  ADD COLUMN "retractedById" TEXT,
  ADD COLUMN "retractionReason" TEXT;
