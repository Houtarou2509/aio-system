-- Add readiness flag used by the issuance foundation/profile workflow.
ALTER TABLE "personnel"
ADD COLUMN IF NOT EXISTS "isReadyForIssuance" BOOLEAN NOT NULL DEFAULT false;
