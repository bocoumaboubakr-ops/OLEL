-- Migration P0: FK Alert.createdById, Mission.createdById, User.deletedAt, index composite

-- Soft delete RGPD
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- FK Alert.createdById → users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'alerts_createdById_fkey' AND table_name = 'alerts'
  ) THEN
    ALTER TABLE "alerts" ADD CONSTRAINT "alerts_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- FK Mission.createdById → users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'missions_createdById_fkey' AND table_name = 'missions'
  ) THEN
    ALTER TABLE "missions" ADD CONSTRAINT "missions_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Index composite (zoneId, createdAt DESC) sur alerts
DROP INDEX IF EXISTS "alerts_zoneId_createdAt_idx";
CREATE INDEX IF NOT EXISTS "alerts_zoneId_createdAt_idx" ON "alerts"("zoneId", "createdAt" DESC);
