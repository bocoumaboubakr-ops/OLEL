-- Vérification terrain par une sentinelle (cursus OLEL) :
-- requise si le signalement initial n'a ni GPS ni photo (ex: WhatsApp texte).
ALTER TABLE "signalements" ADD COLUMN "fieldVerifiedAt" TIMESTAMP(3);
ALTER TABLE "signalements" ADD COLUMN "fieldVerifiedById" TEXT;
ALTER TABLE "signalements" ADD COLUMN "fieldNotes" TEXT;
ALTER TABLE "signalements"
  ADD CONSTRAINT "signalements_fieldVerifiedById_fkey"
  FOREIGN KEY ("fieldVerifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "signalements_fieldVerifiedById_idx" ON "signalements"("fieldVerifiedById");
