-- AlterTable: add signatoryMode columns with safe defaults
ALTER TABLE "agreement_templates" ADD COLUMN IF NOT EXISTS "signatoryMode" TEXT NOT NULL DEFAULT 'recipientPropertyOfficerAuthorizedRep';
ALTER TABLE "agreement_template_versions" ADD COLUMN IF NOT EXISTS "signatoryMode" TEXT NOT NULL DEFAULT 'recipientPropertyOfficerAuthorizedRep';
ALTER TABLE "agreement_documents" ADD COLUMN IF NOT EXISTS "signatoryMode" TEXT NOT NULL DEFAULT 'recipientPropertyOfficerAuthorizedRep';

-- Backfill any existing NULL rows (defensive, though default should handle)
UPDATE "agreement_templates" SET "signatoryMode" = 'recipientPropertyOfficerAuthorizedRep' WHERE "signatoryMode" IS NULL;
UPDATE "agreement_template_versions" SET "signatoryMode" = 'recipientPropertyOfficerAuthorizedRep' WHERE "signatoryMode" IS NULL;
UPDATE "agreement_documents" SET "signatoryMode" = 'recipientPropertyOfficerAuthorizedRep' WHERE "signatoryMode" IS NULL;
