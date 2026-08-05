import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
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
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import aiConfig from './config/ai.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
      load: [appConfig, databaseConfig, jwtConfig, aiConfig],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    SharedModule,
    PrismaModule,
    StorageModule,
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
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
