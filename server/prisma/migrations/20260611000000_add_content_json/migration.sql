-- AlterTable: Add contentJson to AgreementTemplate
ALTER TABLE "agreement_templates" ADD COLUMN "contentJson" JSONB;

-- AlterTable: Add contentJson to AgreementTemplateVersion
ALTER TABLE "agreement_template_versions" ADD COLUMN "contentJson" JSONB;