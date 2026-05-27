const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const models = ['guestToken', 'assignment', 'maintenanceLog', 'auditLog', 'personnel', 'asset', 'user', 'labelTemplate'];
  for (const m of models) { try { await prisma[m].deleteMany(); } catch(e) {} }
  console.log('DB cleaned');
  await prisma.$disconnect();
}
main();
