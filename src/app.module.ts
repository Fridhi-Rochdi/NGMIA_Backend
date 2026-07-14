import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AiEngineModule } from './modules/ai-engine/ai-engine.module';
import { ContentModule } from './modules/content/content.module';
import { SocialModule } from './modules/social/social.module';
import { ImagesModule } from './modules/images/images.module';
import { BrandingModule } from './modules/branding/branding.module';
import { PlannerModule } from './modules/planner/planner.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
      load: [appConfig, databaseConfig, jwtConfig],
    }),
    SharedModule,
    PrismaModule,
    AuthModule,
    TenantModule,
    AiEngineModule,
    ContentModule,
    SocialModule,
    ImagesModule,
    BrandingModule,
    PlannerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*');
  }
}
