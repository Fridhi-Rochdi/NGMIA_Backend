import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { assertPublicUrlsConfigured } from './common/app-url';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // Published documents reference their images by absolute URL; a wrong base
  // here means every generated menu and site ships broken images.
  assertPublicUrlsConfigured();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Stripe webhook signatures are computed over the exact bytes received,
    // so the raw body must survive JSON parsing.
    rawBody: true,
  });
  app.disable('x-powered-by');
  // The session lives in HttpOnly cookies; without this they arrive unparsed.
  app.use(cookieParser());
  app.set('trust proxy', 'loopback');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    next();
  });

  // Generated assets are referenced by absolute URL from documents rendered on
  // another origin: a published menu in a sandboxed iframe, a downloaded HTML
  // file, a deployed site. Without CORS the browser refuses to read them back,
  // which broke the PNG/JPG export (html-to-image inlines every image, and a
  // cross-origin fetch it cannot read fails the whole export).
  //
  // These files are public by design — anyone holding the URL of a published
  // menu can already see them — so the allowance is deliberate, not a leak.
  app.useStaticAssets(join(process.cwd(), 'storage', 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      // Needed alongside the above when the embedding page sets COEP.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const allowedOrigins = (
    process.env.FRONTEND_URL || 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: allowedOrigins,
    // Session cookies only cross origins when credentials are allowed and the
    // origin is echoed explicitly — a wildcard would silently drop them.
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('NextGen MarketingAI API')
      .setDescription('API documentation for NextGen MarketingAI SaaS platform')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger docs available at http://localhost:${port}/api/docs`);
  }
}

bootstrap();
