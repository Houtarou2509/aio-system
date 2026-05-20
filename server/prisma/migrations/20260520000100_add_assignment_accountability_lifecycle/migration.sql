ALTER TABLE "assignments"
ADD COLUMN "conditionAtIssue" TEXT,
ADD COLUMN "conditionAtReturn" TEXT,
ADD COLUMN "returnRemarks" TEXT,
ADD COLUMN "returnedReceivedById" TEXT,
ADD COLUMN "accountabilityStatus" TEXT NOT NULL DEFAULT 'PENDING_SIGNATURE',
ADD COLUMN "accountabilityClosedAt" TIMESTAMP(3);

UPDATE "assignments"
SET
  "conditionAtIssue" = COALESCE("conditionAtIssue", "condition"),
  "conditionAtReturn" = CASE WHEN "returnedAt" IS NOT NULL THEN COALESCE("conditionAtReturn", "condition") ELSE "conditionAtReturn" END,
  "accountabilityStatus" = CASE
    WHEN "returnedAt" IS NOT NULL THEN 'RETURNED'
    WHEN "recipientSignedAt" IS NOT NULL THEN 'ACTIVE'
    ELSE 'PENDING_SIGNATURE'
  END,
  "accountabilityClosedAt" = CASE WHEN "returnedAt" IS NOT NULL THEN COALESCE("accountabilityClosedAt", "returnedAt") ELSE "accountabilityClosedAt" END;

CREATE INDEX "assignments_accountabilityStatus_idx" ON "assignments"("accountabilityStatus");
