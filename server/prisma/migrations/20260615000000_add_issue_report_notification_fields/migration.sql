-- Add issue-report notification targeting columns and update NotificationType enum

-- Add new enum values if they don't already exist (PostgreSQL enum additions are idempotent-ish)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'ISSUE_REPORT_RESOLVED'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'ISSUE_REPORT_RESOLVED';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'ISSUE_REPORT_CLOSED'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'ISSUE_REPORT_CLOSED';
    END IF;
END $$;

-- Make assetId nullable if not already
ALTER TABLE "notifications" ALTER COLUMN "assetId" DROP NOT NULL;

-- Add issueReportId column if missing
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "issueReportId" TEXT;

-- Add recipientUserId column if missing
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "recipientUserId" TEXT;

-- Add indexes if missing
CREATE INDEX IF NOT EXISTS "notifications_assetId_idx" ON "notifications"("assetId");
CREATE INDEX IF NOT EXISTS "notifications_createdAt_idx" ON "notifications"("createdAt");
CREATE INDEX IF NOT EXISTS "notifications_issueReportId_idx" ON "notifications"("issueReportId");
CREATE INDEX IF NOT EXISTS "notifications_recipientUserId_isRead_idx" ON "notifications"("recipientUserId", "isRead");

-- Add foreign keys if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'notifications_issueReportId_fkey'
        AND table_name = 'notifications'
    ) THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issueReportId_fkey"
            FOREIGN KEY ("issueReportId") REFERENCES "issue_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'notifications_recipientUserId_fkey'
        AND table_name = 'notifications'
    ) THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey"
            FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
