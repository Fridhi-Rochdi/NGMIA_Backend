-- One Stripe customer per tenant, reused across checkout sessions.
ALTER TABLE "tenants" ADD COLUMN "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_stripeCustomerId_key" ON "tenants"("stripeCustomerId");
