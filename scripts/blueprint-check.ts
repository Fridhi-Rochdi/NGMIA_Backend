/**
 * Checks that the site generator produces a different object per trade.
 *
 * The rule the user set is "ne pas appliquer le même template à tous les
 * businesses", so these assert difference, not just validity.
 *
 *   npm run test:blueprint
 */
import {
  BLUEPRINT_CATEGORIES,
  classifyBusiness,
  planSite,
} from '../src/modules/website/website-blueprint';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n1. Classification');
{
  const cases: [string, string, string][] = [
    ['PIZZERIA', 'pizzeria napolitaine, four a bois', 'hospitality'],
    ['RESTAURANT', '', 'hospitality'],
    ['Salon de coiffure', 'coupe et couleur', 'beauty'],
    ['Cabinet dentaire', '', 'health'],
    ['Menuiserie', 'menuiserie sur mesure', 'trades'],
    ['Agence de communication', '', 'agency'],
    ['SaaS', 'plateforme de gestion', 'saas'],
    ['Boutique', 'concept store mode', 'retail'],
    ['Avocat', 'droit des affaires', 'professional'],
    // "cabinet" and "salon" are generic enough to steal these if the patterns
    // are written loosely.
    ["Cabinet d'avocats", 'droit du travail', 'professional'],
    ['Cabinet comptable', '', 'professional'],
    ['Cabinet dentaire', 'soins et implants', 'health'],
    ['Salon de the', 'patisseries maison', 'hospitality'],
    // A shop you buy from, not a room you book: never "Reserver une table".
    ['BAKERY', 'boulangerie au levain naturel', 'foodshop'],
    ['Boulangerie', '', 'foodshop'],
    ['Patisserie', 'gateaux sur commande', 'foodshop'],
    ['Glacier', '', 'foodshop'],
    ['Food truck', 'burgers', 'foodshop'],
    ['Garage', 'reparation automobile', 'automotive'],
    ['Salle de sport', '', 'fitness'],
    ['Agence immobiliere', '', 'realestate'],
    ['', 'quelque chose de totalement inclassable', 'other'],
  ];
  for (const [type, desc, expected] of cases) {
    const got = classifyBusiness(type, desc);
    check(`"${type || desc.slice(0, 20)}" -> ${expected}`, got === expected, got);
  }
}

console.log('\n2. Chaque metier a sa propre architecture');
{
  const plans = BLUEPRINT_CATEGORIES.map((c) => {
    // Drive each category through its own keyword so planSite is exercised
    // end to end rather than reading the table directly.
    const probe: Record<string, string> = {
      hospitality: 'restaurant',
      foodshop: 'boulangerie',
      retail: 'boutique',
      agency: 'agence',
      saas: 'saas',
      health: 'clinique',
      trades: 'menuiserie',
      beauty: 'salon de coiffure',
      realestate: 'immobilier',
      education: 'formation',
      events: 'evenement',
      professional: 'avocat',
      fitness: 'fitness',
      automotive: 'garage',
      other: 'zzz-inconnu',
    };
    return planSite({ businessType: probe[c], description: '' });
  });

  const signatures = plans.map((p) => p.sections.map((s) => s.role).join('>'));
  const unique = new Set(signatures);
  check(
    'aucune architecture n est reutilisee telle quelle',
    unique.size === signatures.length,
    `${unique.size}/${signatures.length} distinctes`,
  );

  const actions = new Set(plans.map((p) => p.primaryAction));
  check('les appels a l action different', actions.size >= 6, `${actions.size} distincts`);

  const styles = new Set(plans.map((p) => p.visualStyle));
  check('les directions visuelles different', styles.size >= 4, `${styles.size} distinctes`);

  // Every site opening on the same blue is the clearest tell of a generated
  // page, so the palettes must be distinct per trade and restrained.
  const primaries = new Set(plans.map((p) => p.palette.primary));
  check('les couleurs primaires different', primaries.size === plans.length, `${primaries.size}/${plans.length}`);
  const accents = new Set(plans.map((p) => p.palette.accent));
  check('les accents different', accents.size === plans.length, `${accents.size}/${plans.length}`);
  check(
    'toutes les couleurs sont des hex valides',
    plans.every((p) => [p.palette.primary, p.palette.secondary, p.palette.accent]
      .every((c) => /^#[0-9a-f]{6}$/i.test(c))),
  );
  // A primary used behind white text has to be dark enough to carry it.
  const lum = (hex: string) => {
    const v = hex.slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const worst = plans
    .map((p) => ({ c: p.category, ratio: 1.05 / (lum(p.palette.primary) + 0.05) }))
    .sort((a, b) => a.ratio - b.ratio)[0];
  check(
    'chaque primaire porte du blanc en AA',
    worst.ratio >= 4.5,
    `pire: ${worst.c} a ${worst.ratio.toFixed(2)}:1`,
  );

  check(
    'chaque plan a un hero et un contact',
    plans.every(
      (p) => p.sections[0].type === 'hero' && p.sections.some((s) => s.type === 'contact'),
    ),
  );
  check(
    'chaque plan prevoit au moins un visuel',
    plans.every((p) => p.sections.some((s) => (s.shots?.length || 0) > 0)),
  );
  check(
    'aucun role duplique dans un plan',
    plans.every((p) => new Set(p.sections.map((s) => s.role)).size === p.sections.length),
  );
  check(
    'chaque section porte un brief',
    plans.every((p) => p.sections.every((s) => s.brief.length > 20)),
  );
}

console.log('\n3. Sections specifiques au metier');
{
  const resto = planSite({ businessType: 'restaurant' });
  check('la restauration a une carte', resto.sections.some((s) => s.role === 'menu-highlights'));
  check('la restauration a une galerie', resto.sections.some((s) => s.type === 'gallery'));

  const saas = planSite({ businessType: 'saas' });
  check('un SaaS a des tarifs', saas.sections.some((s) => s.role === 'pricing'));
  check('un SaaS a un "comment ca marche"', saas.sections.some((s) => s.role === 'how-it-works'));
  check('un SaaS a des cas d usage', saas.sections.some((s) => s.role === 'use-cases'));
  check('un SaaS n a pas de carte', !saas.sections.some((s) => s.role === 'menu-highlights'));

  const agence = planSite({ businessType: 'agence' });
  check('une agence a un portfolio', agence.sections.some((s) => s.role === 'work'));
  check('une agence a une methode', agence.sections.some((s) => s.role === 'method'));

  const artisan = planSite({ businessType: 'menuiserie' });
  check('un artisan a des chantiers', artisan.sections.some((s) => s.role === 'projects'));
  check('un artisan a un atelier', artisan.sections.some((s) => s.role === 'workshop'));

  const sante = planSite({ businessType: 'cabinet dentaire' });
  check('la sante a une premiere consultation', sante.sections.some((s) => s.role === 'first-visit'));
  check('la sante n a ni portfolio ni tarifs', !sante.sections.some((s) => ['work', 'pricing'].includes(s.role)));
}

console.log('\n4. Adaptation au contenu fourni');
{
  const withProducts = planSite({ businessType: 'restaurant', hasProducts: true });
  check('des produits fournis remplacent la carte generee',
    withProducts.sections.some((s) => s.type === 'products') &&
      !withProducts.sections.some((s) => s.role === 'menu-highlights'));

  const noGallery = planSite({ businessType: 'restaurant', hasGallery: false });
  check('sans galerie, aucune section galerie vide',
    !noGallery.sections.some((s) => s.type === 'gallery'));

  const agencyProducts = planSite({ businessType: 'agence', hasProducts: true });
  check('des produits fournis remplacent les services',
    !agencyProducts.sections.some((s) => s.role === 'services') &&
      agencyProducts.sections.some((s) => s.type === 'products'));
}

console.log('\n5. Comparaison directe pizzeria / cabinet d avocats');
{
  const a = planSite({ businessType: 'pizzeria' });
  const b = planSite({ businessType: 'avocat' });
  const ra = a.sections.map((s) => s.role);
  const rb = b.sections.map((s) => s.role);
  const shared = ra.filter((r) => rb.includes(r));
  check(
    'les deux sites ne partagent que le squelette',
    shared.length <= 4,
    `partagent: ${shared.join(', ')}`,
  );
  check('les CTA different', a.primaryAction !== b.primaryAction, `${a.primaryAction} / ${b.primaryAction}`);
  check('les styles different', a.visualStyle !== b.visualStyle, `${a.visualStyle} / ${b.visualStyle}`);
  console.log(`  pizzeria : ${ra.join(' > ')}`);
  console.log(`  avocat   : ${rb.join(' > ')}`);
}

console.log(failures ? `\n${failures} verification(s) en echec\n` : '\nToutes les verifications passent\n');
process.exit(failures ? 1 : 0);
