-- AlterTable: Add letterheadPath to AgreementTemplate
ALTER TABLE "agreement_templates" ADD COLUMN "letterheadPath" TEXT;

-- AlterTable: Add letterheadPath to AgreementTemplateVersion
ALTER TABLE "agreement_template_versions" ADD COLUMN "letterheadPath" TEXT;

-- AlterTable: Add letterheadPath to AgreementDocument
ALTER TABLE "agreement_documents" ADD COLUMN "letterheadPath" TEXT;