/**
 * Moves images stored inline (base64 data: URLs) out of the database.
 *
 * Rows written before uploads were stored as files still carry the picture
 * itself in `images.url` and `brands.logo`: about 110 KB of text per image,
 * sent in full every time a list is loaded. Each one is written to the
 * upload store and the row is pointed at the file. Safe to run again: rows
 * that already hold a path are left alone.
 *
 *   npx ts-node scripts/migrate-inline-images.ts            # local
 *   node dist/scripts/migrate-inline-images.js              # (if compiled)
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BrandAssetService } from '../src/common/brand-kit/brand-asset.service';
import { LogoAssetService } from '../src/common/brand-kit/logo-asset.service';
import { absoluteAssetUrl } from '../src/common/app-url';

(async () => {
  process.env.AUTO_POST_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const assets = app.get(BrandAssetService);
  const logos = app.get(LogoAssetService);

  let images = 0;
  for (const image of await prisma.image.findMany({ where: { url: { startsWith: 'data:' } } })) {
    const stored = await assets.store(image.url, `t-${image.tenantId}`);
    if (!stored) {
      console.warn(`Image ${image.id}: illisible, laissee telle quelle`);
      continue;
    }
    await prisma.image.update({ where: { id: image.id }, data: { url: absoluteAssetUrl(stored) || stored } });
    images += 1;
  }

  let brands = 0;
  for (const brand of await prisma.brand.findMany({ where: { logo: { startsWith: 'data:' } } })) {
    const stored = await logos.store(brand.logo!, `t-${brand.tenantId}`);
    if (!stored) {
      console.warn(`Logo de la marque ${brand.id}: illisible, laisse tel quel`);
      continue;
    }
    const variants = Object.fromEntries(Object.entries(stored).filter(([, v]) => Boolean(v)));
    await prisma.brand.update({ where: { id: brand.id }, data: { logo: stored.primary, logoVariants: variants } });
    brands += 1;
  }

  console.log(`Images converties: ${images}, logos convertis: ${brands}`);
  await app.close();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
