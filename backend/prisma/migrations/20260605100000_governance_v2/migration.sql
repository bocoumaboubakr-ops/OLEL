-- Migration governance_v2 : nouveaux rôles, AlertLevel, workflow 7 étapes,
-- entités territoriales, RBAC explicite, validation critique, broadcast enrichi.

-- ── 1. Nouveaux types ENUM ────────────────────────────────────────────────────

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COORDINATEUR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HYDRO_METEO';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'RADIO_COMMUNAUTAIRE';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERVISEUR_REGIONAL';

CREATE TYPE "AlertLevel" AS ENUM ('BLEU', 'JAUNE', 'ORANGE', 'ROUGE', 'ROUGE_FONCE');

CREATE TYPE "CriticalValidatorCategory" AS ENUM (
  'SENTINELLE_CATEGORY',
  'AUTORITE_LOCALE',
  'AUTORITE_ADMIN'
);

-- Ajout de l'étape COORDINATEUR et GOUVERNANCE dans AlertStep
ALTER TYPE "AlertStep" ADD VALUE IF NOT EXISTS 'COORDINATEUR';
ALTER TYPE "AlertStep" ADD VALUE IF NOT EXISTS 'GOUVERNANCE';

-- ── 2. Entités territoriales ─────────────────────────────────────────────────

CREATE TABLE "regions" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"      TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

CREATE TABLE "departments" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"      TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "regionId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "departments_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");
CREATE INDEX "departments_regionId_idx" ON "departments"("regionId");

CREATE TABLE "municipalities" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"         TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "latitude"     DOUBLE PRECISION,
  "longitude"    DOUBLE PRECISION,
  "radiusKm"     DOUBLE PRECISION,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "municipalities_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "municipalities_code_key" ON "municipalities"("code");
CREATE INDEX "municipalities_departmentId_idx" ON "municipalities"("departmentId");

-- ── 3. Colonnes sur alerts ────────────────────────────────────────────────────

ALTER TABLE "alerts"
  ADD COLUMN IF NOT EXISTS "alertLevel"          "AlertLevel" NOT NULL DEFAULT 'BLEU',
  ADD COLUMN IF NOT EXISTS "municipalityId"      TEXT,
  ADD COLUMN IF NOT EXISTS "criticalValidated"   BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_municipalityId_fkey'
  ) THEN
    ALTER TABLE "alerts"
      ADD CONSTRAINT "alerts_municipalityId_fkey"
      FOREIGN KEY ("municipalityId") REFERENCES "municipalities"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "alerts_alertLevel_status_idx" ON "alerts"("alertLevel", "status");

-- ── 4. RBAC explicite ─────────────────────────────────────────────────────────

CREATE TABLE "permissions" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

CREATE TABLE "role_permissions" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "role"         "Role" NOT NULL,
  "permissionId" TEXT NOT NULL,
  "grantedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "role_permissions_role_permissionId_key" ON "role_permissions"("role", "permissionId");
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- ── 5. Validation critique multi-acteurs ─────────────────────────────────────

CREATE TABLE "alert_critical_validations" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "alertId"           TEXT NOT NULL,
  "validatorId"       TEXT NOT NULL,
  "validatorCategory" "CriticalValidatorCategory" NOT NULL,
  "comment"           TEXT,
  "validatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_critical_validations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alert_critical_validations_alertId_fkey"     FOREIGN KEY ("alertId")     REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alert_critical_validations_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "users"("id")  ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "alert_critical_validations_alertId_validatorId_key" ON "alert_critical_validations"("alertId", "validatorId");
CREATE INDEX "alert_critical_validations_alertId_idx" ON "alert_critical_validations"("alertId");

-- ── 6. Broadcast enrichi ──────────────────────────────────────────────────────

CREATE TABLE "broadcasts" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "alertId"          TEXT NOT NULL,
  "authorId"         TEXT NOT NULL,
  "message"          TEXT NOT NULL,
  "templateId"       TEXT,
  "targetZoneIds"    TEXT[] NOT NULL DEFAULT '{}',
  "channels"         TEXT[] NOT NULL DEFAULT '{}',
  "totalRecipients"  INTEGER NOT NULL DEFAULT 0,
  "deliveredCount"   INTEGER NOT NULL DEFAULT 0,
  "costXof"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "idempotencyKey"   TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "broadcasts_alertId_fkey"  FOREIGN KEY ("alertId")  REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "broadcasts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id")  ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "broadcasts_idempotencyKey_key" ON "broadcasts"("idempotencyKey");
CREATE INDEX "broadcasts_alertId_idx"  ON "broadcasts"("alertId");
CREATE INDEX "broadcasts_authorId_idx" ON "broadcasts"("authorId");
