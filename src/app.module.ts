import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { BrandKitModule } from './common/brand-kit/brand-kit.module';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AiEngineModule } from './modules/ai-engine/ai-engine.module';
import { ContentModule } from './modules/content/content.module';
import { SocialModule } from './modules/social/social.module';
import { ImagesModule } from './modules/images/images.module';
import { BrandingModule } from './modules/branding/branding.module';
import { PlannerModule } from './modules/planner/planner.module';
import { QrCodeModule } from './modules/qr-code/qr-code.module';
import { WebsiteModule } from './modules/website/website.module';
import { MenuModule } from './modules/menu/menu.module';
import { PosterModule } from './modules/poster/poster.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PaymentModule } from './modules/payment/payment.module';
import { BusinessContextModule } from './modules/business-context/business-context.module';
import { ReelsModule } from './modules/reels/reels.module';
import { AdminModule } from './modules/admin/admin.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AiQuotaInterceptor } from './common/quota/ai-quota.interceptor';
import { QuotaModule } from './common/quota/quota.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import aiConfig from './config/ai.config';
import { StaleRenderService } from './common/maintenance/stale-render.service';
import { ContactModule } from './modules/contact/contact.module';

@Module({
  imports: [
    ContactModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
      load: [appConfig, databaseConfig, jwtConfig, aiConfig],
    }),
    // Drives the editorial calendar's automatic publishing.
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    SharedModule,
    PrismaModule,
    QuotaModule,
    BusinessContextModule,
    StorageModule,
    BrandKitModule,
    AuthModule,
    TenantModule,
    AiEngineModule,
    ContentModule,
    SocialModule,
    ImagesModule,
    BrandingModule,
    PlannerModule,
    QrCodeModule,
    WebsiteModule,
    MenuModule,
    PosterModule,
    DashboardModule,
    PaymentModule,
    ReelsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    StaleRenderService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Authenticated by default. A route is reachable anonymously only when it
    // says so with @Public() — forgetting a decorator now fails closed instead
    // of publishing the route.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Enforces @AiQuota(...) on generation endpoints.
    {
      provide: APP_INTERCEPTOR,
      useClass: AiQuotaInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*');
  }
}
