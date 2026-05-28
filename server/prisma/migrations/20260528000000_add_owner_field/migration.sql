-- AlterTable
ALTER TABLE "assets" ADD COLUMN "owner" TEXT;

-- AlterEnum
ALTER TYPE "LookupCategory" ADD VALUE 'OWNER';