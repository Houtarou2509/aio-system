-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "depreciationMethod" TEXT DEFAULT 'straight_line',
ADD COLUMN     "salvageValue" DECIMAL(65,30) DEFAULT 0,
ADD COLUMN     "usefulLifeYears" INTEGER DEFAULT 5;
