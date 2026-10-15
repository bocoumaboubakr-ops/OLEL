-- Audit F22/F24/F25 : consentement et désabonnement, fenêtre WhatsApp,
-- messages entrants durables et sessions du bot. Migration additive.
ALTER TABLE "consents"
  ADD COLUMN "optedOutAt" TIMESTAMP(3),
  ADD COLUMN "optOutSource" TEXT,
  ADD COLUMN "whatsappOptInAt" TIMESTAMP(3),
  ADD COLUMN "whatsappOptInSource" TEXT;

ALTER TABLE "users" ADD COLUMN "lastWhatsappInboundAt" TIMESTAMP(3);

CREATE TYPE "InboundStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

CREATE TABLE "inbound_messages" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "from" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "InboundStatus" NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inbound_messages_status_receivedAt_idx" ON "inbound_messages"("status", "receivedAt");

CREATE TABLE "bot_sessions" (
  "phone" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("phone")
);
CREATE INDEX "bot_sessions_expiresAt_idx" ON "bot_sessions"("expiresAt");
