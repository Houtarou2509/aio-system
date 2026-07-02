-- AlterTable: Add secondarySignatoryTitle to agreement_templates
ALTER TABLE "agreement_templates" ADD COLUMN "secondarySignatoryTitle" TEXT;

-- AlterTable: Add secondarySignatoryTitle to agreement_template_versions
ALTER TABLE "agreement_template_versions" ADD COLUMN "secondarySignatoryTitle" TEXT;

-- AlterTable: Add secondarySignatoryTitle to agreement_documents
ALTER TABLE "agreement_documents" ADD COLUMN "secondarySignatoryTitle" TEXT;