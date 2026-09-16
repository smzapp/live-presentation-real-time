import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
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
  const app = await NestFactory.create(AppModule, { httpsOptions });
  app.enableCors({ origin: corsOriginCheck });
  await app.listen(process.env.PORT ?? 3002);
}
await bootstrap();
