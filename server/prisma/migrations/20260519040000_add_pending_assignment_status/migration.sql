-- Add transient asset lock status used while an issuance wizard is in progress.
ALTER TYPE "AssetStatus" ADD VALUE IF NOT EXISTS 'PENDING_ASSIGNMENT';
