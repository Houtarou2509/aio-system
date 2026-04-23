import { PrismaClient, LookupCategory } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ASSET_TYPES = [
  'Laptop', 'Desktop', 'Monitor', 'Printer',
  'Tablet', 'Phone', 'Server', 'Peripheral', 'Other'
];

const DEFAULT_MANUFACTURERS = ['Lenovo', 'Acer', 'HP', 'Dell'];

async function upsertLookup(category: LookupCategory, value: string) {
  await prisma.lookupValue.upsert({
    where: { category_value: { category, value } },
    update: {},
    create: { category, value, isActive: true }
  });
}

async function main() {
  console.log('Seeding lookup values from existing asset data...');

  // ASSET TYPES
  for (const val of DEFAULT_ASSET_TYPES) {
    await upsertLookup(LookupCategory.ASSET_TYPE, val);
  }
  const existingTypes = await prisma.$queryRaw<{ type: string }[]>`
    SELECT DISTINCT type FROM assets
    WHERE type IS NOT NULL AND type <> ''
  `;
  for (const row of existingTypes) {
    const normalized =
      row.type.charAt(0).toUpperCase() + row.type.slice(1).toLowerCase();
    await upsertLookup(LookupCategory.ASSET_TYPE, normalized);
  }

  // MANUFACTURERS
  for (const val of DEFAULT_MANUFACTURERS) {
    await upsertLookup(LookupCategory.MANUFACTURER, val);
  }
  const existingMfr = await prisma.$queryRaw<{ manufacturer: string }[]>`
    SELECT DISTINCT manufacturer FROM assets
    WHERE manufacturer IS NOT NULL AND manufacturer <> ''
  `;
  for (const row of existingMfr) {
    await upsertLookup(LookupCategory.MANUFACTURER, row.manufacturer);
  }

  // LOCATIONS
  const existingLoc = await prisma.$queryRaw<{ location: string }[]>`
    SELECT DISTINCT location FROM assets
    WHERE location IS NOT NULL AND location <> ''
  `;
  for (const row of existingLoc) {
    await upsertLookup(LookupCategory.LOCATION, row.location);
  }

  // ASSIGNED TO
  const existingAss = await prisma.$queryRaw<{ assignedTo: string }[]>`
    SELECT DISTINCT "assignedTo" FROM assets
    WHERE "assignedTo" IS NOT NULL AND "assignedTo" <> ''
  `;
  for (const row of existingAss) {
    await upsertLookup(LookupCategory.ASSIGNED_TO, row.assignedTo);
  }

  console.log('Done. Lookup values seeded successfully.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });