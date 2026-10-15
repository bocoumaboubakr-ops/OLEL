-- Table de codes OTP pour l'inscription citoyenne par téléphone
CREATE TABLE IF NOT EXISTS "otp_requests" (
  "id"        TEXT NOT NULL,
  "phone"     TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "otp_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "otp_requests_phone_createdAt_idx" ON "otp_requests" ("phone", "createdAt");
