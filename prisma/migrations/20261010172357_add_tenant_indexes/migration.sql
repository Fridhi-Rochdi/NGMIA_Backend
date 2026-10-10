-- CreateIndex
CREATE INDEX "brands_tenantId_updatedAt_idx" ON "brands"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "calendar_events_calendarId_scheduledAt_idx" ON "calendar_events"("calendarId", "scheduledAt");

-- CreateIndex
CREATE INDEX "calendars_tenantId_createdAt_idx" ON "calendars"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "contents_tenantId_createdAt_idx" ON "contents"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "images_tenantId_createdAt_idx" ON "images"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_subscriptionId_createdAt_idx" ON "invoices"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "menus_tenantId_createdAt_idx" ON "menus"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_methods_tenantId_idx" ON "payment_methods"("tenantId");

-- CreateIndex
CREATE INDEX "posters_tenantId_createdAt_idx" ON "posters"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "qr_codes_tenantId_createdAt_idx" ON "qr_codes"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "social_accounts_tenantId_platform_idx" ON "social_accounts"("tenantId", "platform");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "websites_tenantId_createdAt_idx" ON "websites"("tenantId", "createdAt");
