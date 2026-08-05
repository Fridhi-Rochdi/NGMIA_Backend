import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

async function main() {
  const p = new PrismaClient();
  const hash = await bcrypt.hash('Password123!', 12);
  const u = await p.user.update({
    where: { email_tenantId: { email: 'rochdi.fridhi@enicar.ucar.tn', tenantId: '8afcdc34-c5a9-4701-b88e-d7f9f9d2bf64' } },
    data: { password: hash },
  });
  console.log('OK:', u.email, 'password reset to Password123!');
  await p.$disconnect();
}
main();
