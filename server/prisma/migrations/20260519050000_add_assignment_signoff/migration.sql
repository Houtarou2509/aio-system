ALTER TABLE "assignments"
  ADD COLUMN IF NOT EXISTS "recipientSignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recipientSignatureName" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientSignatureMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientSignatureIp" TEXT;
