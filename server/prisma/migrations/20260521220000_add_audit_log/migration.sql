-- Phase 2-A audit log migration
-- Preserve legacy audit columns inside metadata before dropping the old rich audit schema.

-- Drop the old required user relation before renaming performedById to nullable userId.
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_performedById_fkey";

-- Add Phase 2-A metadata column and preserve old rich audit fields there.
ALTER TABLE "audit_logs" ADD COLUMN "metadata" JSONB;

UPDATE "audit_logs"
SET "metadata" = jsonb_strip_nulls(jsonb_build_object(
  'field', "field",
  'oldValue', "oldValue",
  'newValue', "newValue",
  'oldImageUrl', "oldImageUrl",
  'severity', "severity"::text,
  'summary', "summary",
  'userAgent', "userAgent"
));

-- Rename legacy columns that still exist in Phase 2-A.
ALTER TABLE "audit_logs" RENAME COLUMN "performedById" TO "userId";
ALTER TABLE "audit_logs" RENAME COLUMN "performedAt" TO "createdAt";

-- Match Phase 2-A nullability.
ALTER TABLE "audit_logs" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "entityId" DROP NOT NULL;

-- Remove columns that moved into metadata.
ALTER TABLE "audit_logs" DROP COLUMN "field";
ALTER TABLE "audit_logs" DROP COLUMN "oldValue";
ALTER TABLE "audit_logs" DROP COLUMN "newValue";
ALTER TABLE "audit_logs" DROP COLUMN "oldImageUrl";
ALTER TABLE "audit_logs" DROP COLUMN "severity";
ALTER TABLE "audit_logs" DROP COLUMN "summary";
ALTER TABLE "audit_logs" DROP COLUMN "userAgent";

-- Recreate Phase 2-A relation and indexes.
ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- Old AuditSeverity enum is no longer used after the severity column is removed.
DROP TYPE IF EXISTS "AuditSeverity";
