-- Add immutable agreement document snapshots for issued accountability agreements.
CREATE TABLE "agreement_documents" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "title" TEXT NOT NULL,
    "resolvedText" TEXT NOT NULL,
    "headerLogo" TEXT,
    "bulkBatchId" TEXT,
    "personnelId" TEXT,
    "personnelNameSnapshot" TEXT NOT NULL,
    "designationSnapshot" TEXT,
    "projectSnapshot" TEXT,
    "institutionSnapshot" TEXT,
    "assetSnapshot" JSONB NOT NULL,
    "propertyOfficerName" TEXT,
    "authorizedRepName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT NOT NULL,
    "recipientSignedAt" TIMESTAMP(3),
    "recipientSignatureName" TEXT,
    "recipientSignatureMethod" TEXT,
    "recipientSignatureIp" TEXT,
    "signedPdfPath" TEXT,
    "signedUploadedAt" TIMESTAMP(3),
    "signedUploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agreement_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agreement_documents_documentNumber_key" ON "agreement_documents"("documentNumber");
CREATE INDEX "agreement_documents_bulkBatchId_idx" ON "agreement_documents"("bulkBatchId");
CREATE INDEX "agreement_documents_personnelId_idx" ON "agreement_documents"("personnelId");
CREATE INDEX "agreement_documents_issuedAt_idx" ON "agreement_documents"("issuedAt");

ALTER TABLE "assignments" ADD COLUMN "agreementDocumentId" TEXT;

ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "agreement_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_signedUploadedById_fkey" FOREIGN KEY ("signedUploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_agreementDocumentId_fkey" FOREIGN KEY ("agreementDocumentId") REFERENCES "agreement_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
