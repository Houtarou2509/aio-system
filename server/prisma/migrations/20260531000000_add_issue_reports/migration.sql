CREATE TYPE "IssueReportType" AS ENUM ('BUG', 'DATA_ISSUE', 'UI_ISSUE', 'ACCESS_PERMISSION', 'OTHER');

CREATE TYPE "IssueReportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX');

CREATE TABLE "issue_reports" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT,
  "reporterName" TEXT,
  "reporterEmail" TEXT,
  "reporterRole" TEXT,
  "pageUrl" TEXT NOT NULL,
  "issueType" "IssueReportType" NOT NULL,
  "description" TEXT NOT NULL,
  "stepsToReproduce" TEXT,
  "screenshotUrl" TEXT,
  "userAgent" TEXT,
  "status" "IssueReportStatus" NOT NULL DEFAULT 'OPEN',
  "adminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "issue_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "issue_reports_status_idx" ON "issue_reports"("status");
CREATE INDEX "issue_reports_reporterId_idx" ON "issue_reports"("reporterId");
CREATE INDEX "issue_reports_createdAt_idx" ON "issue_reports"("createdAt");

ALTER TABLE "issue_reports"
  ADD CONSTRAINT "issue_reports_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
