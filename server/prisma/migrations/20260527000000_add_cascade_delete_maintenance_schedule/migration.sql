-- AlterTable: Add ON DELETE CASCADE to maintenance_schedules.assetId foreign key
-- This ensures that deleting an Asset automatically deletes its MaintenanceSchedule rows,
-- preventing foreign key constraint violations during test cleanup.

-- Drop existing foreign key constraint
ALTER TABLE "maintenance_schedules" DROP CONSTRAINT "maintenance_schedules_assetId_fkey";

-- Re-add with CASCADE
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;