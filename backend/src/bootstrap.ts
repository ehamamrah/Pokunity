import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './shared/config/app-config';
import { HttpExceptionFilter } from './shared/errors/http-exception.filter';
import { createValidationPipe } from './shared/errors/validation';
import { JsonLogger } from './shared/logging/json-logger';

/** Builds the HTTP application (shared by main.ts and the e2e tests). */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // the payment webhook signature is computed over the raw body
    logger: new JsonLogger((process.env.LOG_LEVEL as 'info') ?? 'info'),
  });
  configureHttp(app, app.get(AppConfig));
  app.enableShutdownHooks();
  return app;
}

function configureHttp(app: NestExpressApplication, config: AppConfig): void {
  app.set('trust proxy', config.env.TRUST_PROXY);
  app.use(helmet());
  app.enableCors({ origin: config.corsOrigins, exposedHeaders: ['X-Request-Id', 'Retry-After', 'Idempotent-Replayed'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useBodyParser('json', { limit: '100kb' });
}
