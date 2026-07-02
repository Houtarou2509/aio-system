ALTER TABLE "assets" ADD COLUMN "qrPrintedAt" TIMESTAMP(3);
ALTER TABLE "assets" ADD COLUMN "qrPrintedById" TEXT;

CREATE INDEX "assets_qrPrintedAt_idx" ON "assets"("qrPrintedAt");
CREATE INDEX "assets_qrPrintedById_idx" ON "assets"("qrPrintedById");

ALTER TABLE "assets"
ADD CONSTRAINT "assets_qrPrintedById_fkey"
FOREIGN KEY ("qrPrintedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
