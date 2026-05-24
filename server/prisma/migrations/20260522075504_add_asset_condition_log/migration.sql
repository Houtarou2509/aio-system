-- CreateTable
CREATE TABLE "asset_condition_logs" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "event" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_condition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_condition_logs_assetId_idx" ON "asset_condition_logs"("assetId");

-- CreateIndex
CREATE INDEX "asset_condition_logs_recordedAt_idx" ON "asset_condition_logs"("recordedAt");

-- AddForeignKey
ALTER TABLE "asset_condition_logs" ADD CONSTRAINT "asset_condition_logs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_condition_logs" ADD CONSTRAINT "asset_condition_logs_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
