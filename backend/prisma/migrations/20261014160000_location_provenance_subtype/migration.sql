-- Audit F18 (provenance des positions de preuve) et F21 (sous-type métier).
-- Migration additive : colonnes facultatives, aucune donnée modifiée.
CREATE TYPE "LocationSource" AS ENUM ('DEVICE_GPS', 'MANUAL');

ALTER TABLE "validations"
  ADD COLUMN "locationSource" "LocationSource",
  ADD COLUMN "locationAccuracyM" DOUBLE PRECISION;

ALTER TABLE "signalements"
  ADD COLUMN "subtype" TEXT,
  ADD COLUMN "locationSource" "LocationSource",
  ADD COLUMN "fieldLocationSource" "LocationSource",
  ADD COLUMN "fieldLocationAccuracyM" DOUBLE PRECISION;

ALTER TABLE "alerts"
  ADD COLUMN "subtype" TEXT,
  ADD COLUMN "locationSource" "LocationSource";
