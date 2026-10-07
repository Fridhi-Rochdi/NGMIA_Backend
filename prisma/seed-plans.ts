import { PrismaClient } from '@prisma/client';

/**
 * The billing catalogue, matching the pricing table on the landing page.
 * Stripe products/prices are created lazily on first checkout and their ids
 * cached back onto these rows, so this file stays the source of truth.
 */
const PLANS = [
  {
    name: 'Essentiel',
    description:
      '200 crédits IA par mois, site web et menu publiés, 2 réseaux sociaux, publication automatique, 1 utilisateur',
    price: 19,
    features: { aiCredits: 200, socialAccounts: 2, seats: 1, autoPublish: true },
  },
  {
    name: 'Pro',
    description:
      '500 crédits IA par mois, tous les réseaux sociaux (Facebook, Instagram, LinkedIn, X), publication automatique, support prioritaire',
    price: 39,
    features: { aiCredits: 500, socialAccounts: 4, seats: 1, autoPublish: true, prioritySupport: true },
  },
  {
    name: 'Business',
    description:
      '1 200 crédits IA par mois, tous les réseaux sociaux, publication automatique, accompagnement à la mise en place',
    price: 79,
    features: { aiCredits: 1200, socialAccounts: 4, seats: 1, autoPublish: true, prioritySupport: true, onboarding: true },
  },
];

/** Plans sold before this catalogue: hidden from new customers, kept for existing subscriptions. */
const RETIRED = ['Starter', 'Growth', 'Professional', 'Enterprise'];

async function main() {
  const prisma = new PrismaClient();
  for (const plan of PLANS) {
    const row = await prisma.planItem.upsert({
      where: { name: plan.name },
      update: {
        description: plan.description,
        price: plan.price,
        currency: 'EUR',
        interval: 'month',
        features: plan.features,
        isActive: true,
      },
      create: {
        name: plan.name,
        description: plan.description,
        price: plan.price,
        currency: 'EUR',
        interval: 'month',
        features: plan.features,
        isActive: true,
      },
    });
    console.log(`${row.name.padEnd(13)} ${row.price}€/mois  id=${row.id}`);
  }
  const retired = await prisma.planItem.updateMany({
    where: { name: { in: RETIRED } },
    data: { isActive: false },
  });
  if (retired.count) console.log(`${retired.count} ancienne(s) offre(s) masquee(s)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
