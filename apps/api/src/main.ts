import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { corsOriginCheck } from './cors.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: corsOriginCheck });
  await app.listen(process.env.PORT ?? 3002);
}
await bootstrap();
