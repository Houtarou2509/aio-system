-- AlterTable
ALTER TABLE "purchase_requests" ADD COLUMN "convertedToAssetId" TEXT;

-- AlterTable
ALTER TABLE "purchase_requests" ADD COLUMN "convertedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_convertedToAssetId_key" ON "purchase_requests"("convertedToAssetId");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_convertedToAssetId_fkey" FOREIGN KEY ("convertedToAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
