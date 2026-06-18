-- CreateEnum
CREATE TYPE "public"."DocumentArchiveType" AS ENUM ('ACCOUNTABILITY_FORM', 'SIGNED_AGREEMENT', 'RETURN_FORM', 'PURCHASE_DOCUMENT', 'DISPOSAL_DOCUMENT');

-- CreateEnum
CREATE TYPE "public"."DocumentArchiveStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'VOID');

-- CreateTable
CREATE TABLE "public"."document_archive_items" (
    "id" TEXT NOT NULL,
    "documentType" "public"."DocumentArchiveType" NOT NULL,
    "title" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "filePath" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "assetId" TEXT,
    "personnelId" TEXT,
    "purchaseRequestId" TEXT,
    "assignmentId" TEXT,
    "status" "public"."DocumentArchiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_archive_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_archive_items_documentType_idx" ON "public"."document_archive_items"("documentType");

-- CreateIndex
CREATE INDEX "document_archive_items_status_idx" ON "public"."document_archive_items"("status");

-- CreateIndex
CREATE INDEX "document_archive_items_assetId_idx" ON "public"."document_archive_items"("assetId");

-- CreateIndex
CREATE INDEX "document_archive_items_personnelId_idx" ON "public"."document_archive_items"("personnelId");

-- CreateIndex
CREATE INDEX "document_archive_items_purchaseRequestId_idx" ON "public"."document_archive_items"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "document_archive_items_assignmentId_idx" ON "public"."document_archive_items"("assignmentId");

-- CreateIndex
CREATE INDEX "document_archive_items_sourceEntityType_sourceEntityId_idx" ON "public"."document_archive_items"("sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE INDEX "document_archive_items_createdAt_idx" ON "public"."document_archive_items"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_archive_items_documentNumber_key" ON "public"."document_archive_items"("documentNumber");

-- AddForeignKey
ALTER TABLE "public"."document_archive_items" ADD CONSTRAINT "document_archive_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_archive_items" ADD CONSTRAINT "document_archive_items_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "public"."personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_archive_items" ADD CONSTRAINT "document_archive_items_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "public"."purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_archive_items" ADD CONSTRAINT "document_archive_items_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "public"."assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_archive_items" ADD CONSTRAINT "document_archive_items_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
