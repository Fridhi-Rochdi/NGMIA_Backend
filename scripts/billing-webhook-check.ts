/**
 * Throwaway verification of the Stripe webhook path.
 *
 * Stripe cannot reach localhost without the CLI, so we sign payloads with the
 * configured STRIPE_WEBHOOK_SECRET exactly as Stripe would and POST them.
 * This exercises the real signature check and the real provisioning code.
 */
import Stripe = require('stripe');
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:4000/billing/webhook';
const SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover' as any,
});
const prisma = new PrismaClient();

function post(body: string, signature: string) {
  return fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
    body,
  });
}

function sign(payload: string) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
}

async function tenantState(slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  const sub = tenant
    ? await prisma.subscription.findUnique({
        where: { tenantId: tenant.id },
        include: { plan: true },
      })
    : null;
  return { plan: tenant?.plan, subStatus: sub?.status, planName: sub?.plan?.name };
}

async function main() {
  const slug = 'atelier-vermeer';
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  const plan = await prisma.planItem.findUnique({ where: { name: 'Growth' } });
  if (!tenant || !plan) throw new Error('fixtures missing');

  // The script ends by cancelling the subscription and leaves its invoices
  // behind, so a second run started from a dirty state and reported four
  // false failures. Reset what this script owns before asserting on it.
  const previous = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  if (previous) {
    await prisma.invoice.deleteMany({ where: { subscriptionId: previous.id } });
    await prisma.subscription.delete({ where: { id: previous.id } });
  }
  await prisma.tenant.update({ where: { id: tenant.id }, data: { plan: 'FREE' } });

  console.log('etat initial :', await tenantState(slug));
  let pass = 0;
  let fail = 0;
  const check = (label: string, ok: boolean, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' -> ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  // ---- 1. forged payload, no signature ------------------------------------
  const forged = JSON.stringify({
    id: 'evt_forged',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_forged',
        payment_status: 'paid',
        subscription: 'sub_forged',
        metadata: { tenantId: tenant.id, planId: plan.id },
      },
    },
  });
  const r1 = await post(forged, '');
  check('webhook sans signature rejete', r1.status === 400, `HTTP ${r1.status}`);

  // ---- 2. forged payload, wrong secret ------------------------------------
  const badSig = stripe.webhooks.generateTestHeaderString({
    payload: forged,
    secret: 'whsec_' + '0'.repeat(48),
  });
  const r2 = await post(forged, badSig);
  check('webhook mal signe rejete', r2.status === 400, `HTTP ${r2.status}`);

  const afterForge = await tenantState(slug);
  check(
    'aucun acces accorde par un faux webhook',
    afterForge.plan === 'FREE' && !afterForge.subStatus,
    JSON.stringify(afterForge),
  );

  // ---- 3. correctly signed but unpaid -> must not provision ---------------
  const unpaid = JSON.stringify({
    id: 'evt_unpaid',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_unpaid',
        payment_status: 'unpaid',
        subscription: 'sub_x',
        metadata: { tenantId: tenant.id, planId: plan.id },
      },
    },
  });
  const r3 = await post(unpaid, sign(unpaid));
  const afterUnpaid = await tenantState(slug);
  check('webhook signe accepte', r3.status === 200, `HTTP ${r3.status}`);
  check(
    'session impayee ne provisionne pas',
    afterUnpaid.plan === 'FREE' && !afterUnpaid.subStatus,
    JSON.stringify(afterUnpaid),
  );

  // ---- 4. a real paid subscription, via Stripe's documented test token ----
  console.log('\ncreation d une vraie souscription Stripe (token de test pm_card_visa)...');
  // Attaching returns a *new* payment-method id; the literal token is not it.
  const attached = await stripe.paymentMethods.attach('pm_card_visa', {
    customer: tenant.stripeCustomerId!,
  });
  await stripe.customers.update(tenant.stripeCustomerId!, {
    invoice_settings: { default_payment_method: attached.id },
  });
  const realSub = await stripe.subscriptions.create({
    customer: tenant.stripeCustomerId!,
    items: [{ price: plan.stripePriceId! }],
    metadata: { tenantId: tenant.id, planId: plan.id },
    expand: ['latest_invoice'],
  });
  console.log('  subscription', realSub.id, '| status', realSub.status);

  const paid = JSON.stringify({
    id: 'evt_paid',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_paid',
        payment_status: 'paid',
        subscription: realSub.id,
        metadata: { tenantId: tenant.id, planId: plan.id },
      },
    },
  });
  const r4 = await post(paid, sign(paid));
  const afterPaid = await tenantState(slug);
  check('webhook paye accepte', r4.status === 200, `HTTP ${r4.status}`);
  check(
    'abonnement provisionne',
    afterPaid.subStatus === 'ACTIVE' && afterPaid.planName === 'Growth',
    JSON.stringify(afterPaid),
  );
  check('plan du tenant releve', afterPaid.plan === 'PRO', `plan=${afterPaid.plan}`);

  // ---- 5. invoice.paid -> facture enregistree -----------------------------
  const invoice = JSON.stringify({
    id: 'evt_inv',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_test_1',
        subscription: realSub.id,
        amount_paid: 4900,
        currency: 'eur',
        hosted_invoice_url: 'https://invoice.stripe.com/test',
      },
    },
  });
  await post(invoice, sign(invoice));
  // Stripe retries: the same event twice must not duplicate the row.
  await post(invoice, sign(invoice));
  const invoices = await prisma.invoice.findMany({
    where: { subscription: { tenantId: tenant.id } },
    orderBy: { createdAt: 'desc' },
  });
  check('facture enregistree', invoices.length === 1, `${invoices.length} ligne(s)`);
  check(
    'montant et statut corrects',
    invoices[0] && Number(invoices[0].amount) === 49 && invoices[0].status === 'PAID',
    invoices[0] ? `${invoices[0].amount} ${invoices[0].currency} ${invoices[0].status}` : '-',
  );

  // ---- 6. echec de paiement -> PAST_DUE ----------------------------------
  const failed = JSON.stringify({
    id: 'evt_fail',
    type: 'invoice.payment_failed',
    data: {
      object: { id: 'in_test_2', subscription: realSub.id, amount_due: 4900, currency: 'eur' },
    },
  });
  await post(failed, sign(failed));
  const afterFail = await tenantState(slug);
  check('echec de paiement -> PAST_DUE', afterFail.subStatus === 'PAST_DUE', String(afterFail.subStatus));

  // ---- 7. annulation -> retour a FREE ------------------------------------
  const cancelled = JSON.stringify({
    id: 'evt_cancel',
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: realSub.id,
        status: 'canceled',
        cancel_at_period_end: false,
        metadata: { tenantId: tenant.id, planId: plan.id },
        items: { data: [{}] },
      },
    },
  });
  await post(cancelled, sign(cancelled));
  const afterCancel = await tenantState(slug);
  check(
    'annulation -> CANCELLED + plan FREE',
    afterCancel.subStatus === 'CANCELLED' && afterCancel.plan === 'FREE',
    JSON.stringify(afterCancel),
  );

  // cleanup the Stripe-side subscription so the sandbox stays tidy
  await stripe.subscriptions.cancel(realSub.id).catch(() => undefined);

  console.log(`\nRESULTAT: ${pass} PASS / ${fail} FAIL`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error('ERREUR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
