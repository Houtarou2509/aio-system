-- AlterTable: Add firstSignatoryTitle to agreement_templates
ALTER TABLE "agreement_templates" ADD COLUMN "firstSignatoryTitle" TEXT;

-- AlterTable: Add firstSignatoryTitle to agreement_template_versions
ALTER TABLE "agreement_template_versions" ADD COLUMN "firstSignatoryTitle" TEXT;

-- AlterTable: Add firstSignatoryTitle to agreement_documents
ALTER TABLE "agreement_documents" ADD COLUMN "firstSignatoryTitle" TEXT;