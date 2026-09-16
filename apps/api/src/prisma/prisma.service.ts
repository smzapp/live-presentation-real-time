import { resolve } from 'node:path';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// SQLite file lives at apps/api/prisma/dev.db regardless of the process's cwd
// (nest start vs node dist/main can differ), so resolve it from this file's
// own location rather than trusting process.cwd().
function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const withoutPrefix = raw.startsWith('file:') ? raw.slice('file:'.length) : raw;
  return resolve(import.meta.dirname, '..', '..', withoutPrefix);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaBetterSqlite3({ url: resolveDbPath() }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
