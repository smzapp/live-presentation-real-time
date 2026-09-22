import './env.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { corsOriginCheck } from './cors.js';

// When certs/key.pem + certs/cert.pem exist (generated for LAN/mobile testing —
// iOS Safari refuses camera/mic and some APIs over a plain-http LAN origin),
// serve over HTTPS instead. Falls back to plain HTTP when absent, so nothing
// changes for localhost-only development.
function loadHttpsOptions() {
  const certDir = process.env.HTTPS_CERT_DIR ?? resolve(process.cwd(), '..', '..', 'certs');
  const keyPath = resolve(certDir, 'key.pem');
  const certPath = resolve(certDir, 'cert.pem');
  if (!existsSync(keyPath) || !existsSync(certPath)) return undefined;
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

async function bootstrap() {
  const httpsOptions = loadHttpsOptions();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { httpsOptions });
  // Saved boards carry their images inline, well past Express's 100 KB default.
  app.useBodyParser('json', { limit: '25mb' });
  app.enableCors({ origin: corsOriginCheck });
  // Lets RoomStore flush unsaved session state to the database on Ctrl+C or
  // a deploy's SIGTERM instead of dropping the last few seconds of it.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3002);
}
await bootstrap();
