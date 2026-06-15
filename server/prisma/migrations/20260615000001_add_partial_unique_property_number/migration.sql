-- Add a partial unique index on assets.propertyNumber that ignores NULL and empty strings.
-- This preserves existing nullable/blank behavior while enforcing global uniqueness for non-empty property numbers.
-- If duplicates exist, creation will fail; run the diagnostic query below first to find them.

-- Diagnostic (not run automatically): SELECT LOWER("propertyNumber"), COUNT(*) FROM "assets" WHERE "propertyNumber" IS NOT NULL AND "propertyNumber" <> '' GROUP BY LOWER("propertyNumber") HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "assets_propertyNumber_partial_unique_idx"
  ON "assets"(LOWER("propertyNumber"))
  WHERE "propertyNumber" IS NOT NULL AND "propertyNumber" <> '';
