-- Add explicit revision source for agreement templates.
ALTER TABLE "agreement_templates"
ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "agreement_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "headerLogo" TEXT,
    "defaultPropertyOfficer" TEXT,
    "defaultAuthorizedRep" TEXT,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreement_template_versions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "agreement_template_versions" (
    "id",
    "templateId",
    "versionNumber",
    "name",
    "title",
    "content",
    "headerLogo",
    "defaultPropertyOfficer",
    "defaultAuthorizedRep",
    "changeSummary",
    "createdAt"
)
SELECT
    "id" || '-v1',
    "id",
    1,
    "name",
    "title",
    "content",
    "headerLogo",
    "defaultPropertyOfficer",
    "defaultAuthorizedRep",
    'Initial version backfilled during template versioning migration',
    COALESCE("createdAt", CURRENT_TIMESTAMP)
FROM "agreement_templates";

ALTER TABLE "agreement_documents"
ADD COLUMN "templateVersionId" TEXT;

UPDATE "agreement_documents" d
SET "templateVersion" = COALESCE(d."templateVersion", 1),
    "templateVersionId" = d."templateId" || '-v1'
WHERE d."templateId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "agreement_template_versions" v
    WHERE v."id" = d."templateId" || '-v1'
  );

CREATE UNIQUE INDEX "agreement_template_versions_templateId_versionNumber_key"
ON "agreement_template_versions"("templateId", "versionNumber");

CREATE INDEX "agreement_template_versions_templateId_idx"
ON "agreement_template_versions"("templateId");

CREATE INDEX "agreement_documents_templateVersionId_idx"
ON "agreement_documents"("templateVersionId");

ALTER TABLE "agreement_template_versions"
ADD CONSTRAINT "agreement_template_versions_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "agreement_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agreement_documents"
ADD CONSTRAINT "agreement_documents_templateVersionId_fkey"
FOREIGN KEY ("templateVersionId") REFERENCES "agreement_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
