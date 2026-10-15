-- Audit F06 / F25 : dédoublonnage des signalements reçus par un canal
-- fournisseur (USSD, SVI, WhatsApp). Migration additive, sans perte.
ALTER TABLE "signalements" ADD COLUMN "sourceRef" TEXT;
CREATE UNIQUE INDEX "signalements_sourceRef_key" ON "signalements"("sourceRef");
