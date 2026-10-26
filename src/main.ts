import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Render terminates TLS at its proxy; trusting one hop gives the throttler the real client IP.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableShutdownHooks();

  const port = app
    .get(ConfigService<EnvironmentVariables, true>)
    .get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`Listening on port ${port}`, 'Bootstrap');
}

await bootstrap();
