-- Formations & Missions sentinelles (AUDIT_PREDEPLOIEMENT_V2.md)

-- Enums
DO $$ BEGIN CREATE TYPE "TrainingCategory" AS ENUM ('SECOURISME','RISQUE_LOCAL','PROCEDURE','SENSIBILISATION'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MissionType" AS ENUM ('VERIFICATION','PATROUILLE','SENSIBILISATION','EVACUATION'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MissionStatus" AS ENUM ('OPEN','ASSIGNED','IN_PROGRESS','DONE','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- User : dernière activité (désactivation auto > 30j)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);

-- Modules de formation
CREATE TABLE IF NOT EXISTS "training_modules" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" "TrainingCategory" NOT NULL DEFAULT 'PROCEDURE',
  "order" INTEGER NOT NULL DEFAULT 0,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "durationMin" INTEGER NOT NULL DEFAULT 15,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "training_lessons" (
  "id" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "training_lessons_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "training_lessons_moduleId_idx" ON "training_lessons" ("moduleId");

CREATE TABLE IF NOT EXISTS "training_progress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "score" INTEGER,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "training_progress_userId_moduleId_key" ON "training_progress" ("userId", "moduleId");
CREATE INDEX IF NOT EXISTS "training_progress_userId_idx" ON "training_progress" ("userId");

-- Missions
CREATE TABLE IF NOT EXISTS "missions" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "type" "MissionType" NOT NULL DEFAULT 'VERIFICATION',
  "status" "MissionStatus" NOT NULL DEFAULT 'OPEN',
  "zoneId" TEXT,
  "alertId" TEXT,
  "createdById" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "missions_status_createdAt_idx" ON "missions" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "missions_zoneId_idx" ON "missions" ("zoneId");

CREATE TABLE IF NOT EXISTS "mission_assignments" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "sentinelId" TEXT NOT NULL,
  "status" "MissionStatus" NOT NULL DEFAULT 'ASSIGNED',
  "report" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "mission_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mission_assignments_missionId_sentinelId_key" ON "mission_assignments" ("missionId", "sentinelId");
CREATE INDEX IF NOT EXISTS "mission_assignments_sentinelId_idx" ON "mission_assignments" ("sentinelId");

-- Foreign keys (idempotent via DO blocks)
DO $$ BEGIN
  ALTER TABLE "training_lessons" ADD CONSTRAINT "training_lessons_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "training_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "training_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "missions" ADD CONSTRAINT "missions_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "mission_assignments" ADD CONSTRAINT "mission_assignments_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "mission_assignments" ADD CONSTRAINT "mission_assignments_sentinelId_fkey" FOREIGN KEY ("sentinelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
