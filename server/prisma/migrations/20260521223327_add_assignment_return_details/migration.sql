-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "returnCondition" TEXT,
ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "returnedById" TEXT;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
