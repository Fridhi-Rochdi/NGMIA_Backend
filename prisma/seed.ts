import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1. Create tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'mon-entreprise' },
    update: {},
    create: {
      name: 'Mon Entreprise',
      slug: 'mon-entreprise',
      plan: 'FREE',
    },
  });
  console.log('Tenant:', tenant.id);

  // 2. Create user
  const hashedPassword = await bcrypt.hash('Password123!', 12);
  const user = await prisma.user.upsert({
    where: {
      email_tenantId: {
        email: 'rochdi.fridhi@enicar.ucar.tn',
        tenantId: tenant.id,
      },
    },
    update: { password: hashedPassword },
    create: {
      email: 'rochdi.fridhi@enicar.ucar.tn',
      password: hashedPassword,
      firstName: 'Rochdi',
      lastName: 'Fridhi',
      role: 'ADMIN',
      tenantId: tenant.id,
    },
  });
  console.log('User:', user.id, user.email, user.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
