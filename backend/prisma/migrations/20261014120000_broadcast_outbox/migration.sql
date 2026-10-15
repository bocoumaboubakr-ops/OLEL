-- Lot A3 (audit F03/F04/F05/F17/F22/F23) : diffusion durable (outbox),
-- texte figé, certitude, suivi par destinataire et canal.
-- Migration additive. AUCUNE diffusion historique n'est rejouée.

CREATE TYPE "BroadcastKind" AS ENUM ('INTERNAL', 'PREALERT', 'PRIMARY');
CREATE TYPE "BroadcastCertainty" AS ENUM ('CONFIRMED', 'UNCONFIRMED_AUTO', 'EMERGENCY_BYPASS', 'PREALERT', 'INTERNAL');
CREATE TYPE "BroadcastStatus" AS ENUM ('PENDING', 'DISPATCHING', 'DONE', 'PARTIAL', 'FAILED', 'CANCELLED');
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SIMULATED', 'SKIPPED');

-- Les diffusions existantes ont déjà été traitées par l'ancien processeur :
-- elles naissent DONE (défaut temporaire), puis le défaut passe à PENDING
-- pour les nouvelles. Aucune fenêtre où une ligne ancienne serait PENDING.
ALTER TABLE "broadcasts"
  ADD COLUMN "status" "BroadcastStatus" NOT NULL DEFAULT 'DONE',
  ADD COLUMN "kind" "BroadcastKind",
  ADD COLUMN "certainty" "BroadcastCertainty",
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "alertLevel" "AlertLevel",
  ADD COLUMN "sentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "simulatedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "broadcasts" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Ancien sens de deliveredCount = « appel fournisseur réussi » : déplacé
-- vers sentCount ; deliveredCount ne compte plus que les livraisons confirmées.
UPDATE "broadcasts" SET "sentCount" = "deliveredCount", "deliveredCount" = 0;

-- kind NULL pour l'historique : l'unicité (alertId, kind) ne s'applique
-- qu'aux nouvelles diffusions (NULL distincts en PostgreSQL).
CREATE UNIQUE INDEX "broadcasts_alertId_kind_key" ON "broadcasts"("alertId", "kind");
CREATE INDEX "broadcasts_status_idx" ON "broadcasts"("status");

CREATE TABLE "broadcast_deliveries" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "userId" TEXT,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'fr',
    "status" "DeliveryStatus" NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "broadcast_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "broadcast_deliveries_broadcastId_recipient_channel_key"
  ON "broadcast_deliveries"("broadcastId", "recipient", "channel");
CREATE INDEX "broadcast_deliveries_providerMessageId_idx" ON "broadcast_deliveries"("providerMessageId");
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_broadcastId_fkey"
  FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Correctif d'une suppression manquée : la migration 20260604120000 tentait
-- « DROP CONSTRAINT IF EXISTS validations_alertId_validatorId_key » alors que
-- l'objet est un INDEX ; il était donc toujours présent et provoquait une
-- erreur 500 quand la même autorité enchaînait deux étapes (ex. MAIRIE qui
-- vérifie puis diffuse une alerte ORANGE). La règle des deux personnes
-- distinctes est désormais appliquée explicitement là où elle s'impose
-- (ROUGE / ROUGE_FONCE, voir alerts/alert-policy.ts). Aucune donnée perdue.
DROP INDEX IF EXISTS "validations_alertId_validatorId_key";

-- Revue a posteriori des diffusions d'urgence (bypass) — audit F05
ALTER TABLE "alerts"
  ADD COLUMN "bypassReviewedAt" TIMESTAMP(3),
  ADD COLUMN "bypassReviewedById" TEXT,
  ADD COLUMN "bypassReviewNote" TEXT;
