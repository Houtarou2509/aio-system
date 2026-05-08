-- CreateEnum
CREATE TYPE "DisposalMethod" AS ENUM ('DONATED', 'SOLD', 'SCRAPPED', 'RETURNED_TO_VENDOR', 'OTHER');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "disposalDate" TIMESTAMP(3),
ADD COLUMN     "disposalMethod" "DisposalMethod",
ADD COLUMN     "disposalReason" TEXT;
