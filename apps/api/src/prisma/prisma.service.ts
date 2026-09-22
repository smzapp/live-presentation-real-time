import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to apps/api/.env, e.g. ' +
        'postgresql://postgres:password@localhost:5432/livepresentation',
    );
  }
  return url;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // onApplicationShutdown rather than onModuleDestroy: it runs after every
  // beforeApplicationShutdown hook, which is where RoomStore does its final
  // flush — disconnecting any earlier would make that flush fail.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
