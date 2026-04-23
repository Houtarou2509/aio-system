import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@aio-system.local',
      passwordHash,
      role: 'ADMIN',
      twoFactorEnabled: false,
      backupCodes: '[]',
    },
  });

  console.log(`Admin user created: ${admin.username} (${admin.email})`);
  console.log('Password: admin123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());