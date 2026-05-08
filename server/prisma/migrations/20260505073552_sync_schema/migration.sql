/*
  Warnings:

  - The `type` column on the `assets` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "LookupCategory" AS ENUM ('ASSET_TYPE', 'MANUFACTURER', 'LOCATION', 'ASSIGNED_TO');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('WARRANTY_EXPIRING', 'MAINTENANCE_OVERDUE');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "deletedAt" TIMESTAMP(3),
DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'Other';

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "agreementId" TEXT,
ADD COLUMN     "agreementText" TEXT,
ADD COLUMN     "personnelId" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "oldImageUrl" TEXT,
ADD COLUMN     "severity" "AuditSeverity" NOT NULL DEFAULT 'LOW',
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "maintenance_schedules" ADD COLUMN     "frequency" TEXT DEFAULT 'none';

-- DropEnum
DROP TYPE "AssetType";

-- CreateTable
CREATE TABLE "lookup_values" (
    "id" SERIAL NOT NULL,
    "category" "LookupCategory" NOT NULL,
    "value" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookup_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "designation" TEXT,
    "project" TEXT,
    "projectYear" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "hiredDate" TIMESTAMP(3),
    "employmentHistory" TEXT DEFAULT '',
    "personnelType" TEXT NOT NULL DEFAULT 'employee',
    "contractDurationMonths" INTEGER,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "signedAgreementPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "institutionId" INTEGER,
    "projectId" INTEGER,
    "designationId" INTEGER,

    CONSTRAINT "personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_lookup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_lookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_lookup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_lookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designation_lookup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "designation_lookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_history" (
    "id" SERIAL NOT NULL,
    "profileId" TEXT NOT NULL,
    "designation" TEXT,
    "institutionName" TEXT,
    "projectName" TEXT,
    "projectYear" TEXT,
    "hiredDate" TIMESTAMP(3),
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "title" TEXT NOT NULL DEFAULT 'ISSUANCE & ACCOUNTABILITY AGREEMENT',
    "content" TEXT NOT NULL DEFAULT '',
    "headerLogo" TEXT,
    "defaultLogo" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "defaultPropertyOfficer" TEXT,
    "defaultAuthorizedRep" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agreement_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lookup_values_category_value_key" ON "lookup_values"("category", "value");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_email_key" ON "personnel"("email");

-- CreateIndex
CREATE UNIQUE INDEX "institution_lookup_name_key" ON "institution_lookup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "project_lookup_name_key" ON "project_lookup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "designation_lookup_name_key" ON "designation_lookup"("name");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreement_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institution_lookup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project_lookup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designation_lookup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_history" ADD CONSTRAINT "profile_history_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
