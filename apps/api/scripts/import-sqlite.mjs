// One-off copy of the old SQLite dev database into PostgreSQL:
//   npm run db:import-sqlite            (reads prisma/dev.db)
//   npm run db:import-sqlite -- path/to/other.db
// Run it after `npm run db:migrate` against an empty Postgres database.
// Rows that already exist (same id/key) are skipped, so it's safe to re-run.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const envPath = resolve(import.meta.dirname, "..", ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
if (!process.env.DATABASE_URL?.startsWith("postgres")) {
  console.error("DATABASE_URL must point at PostgreSQL (see apps/api/.env).");
  process.exit(1);
}

const sqlitePath = resolve(import.meta.dirname, "..", process.argv[2] ?? "prisma/dev.db");
if (!existsSync(sqlitePath)) {
  console.error(`No SQLite database at ${sqlitePath}`);
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// SQLite has no native date/boolean types: Prisma stored dates as ISO text
// (or epoch ms) and booleans as 0/1, so convert those columns back.
const TABLES = [
  { table: "User", model: "user", dates: ["lastLoginAt", "createdAt"] },
  { table: "Plan", model: "plan", dates: ["createdAt"], bools: ["isActive"] },
  { table: "Subscription", model: "subscription", dates: ["startedAt", "renewsAt", "canceledAt", "updatedAt"] },
  { table: "AppSetting", model: "appSetting", dates: ["updatedAt"] },
  { table: "BoardFolder", model: "boardFolder", dates: ["createdAt"] },
  { table: "Board", model: "board", dates: ["createdAt", "updatedAt"] },
];

function toDate(value) {
  if (value === null || value === undefined) return value;
  return new Date(typeof value === "number" ? value : String(value));
}

function tableExists(name) {
  return !!sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name);
}

try {
  for (const { table, model, dates = [], bools = [] } of TABLES) {
    if (!tableExists(table)) {
      console.log(`${table}: not in the SQLite database, skipped`);
      continue;
    }
    const rows = sqlite.prepare(`select * from "${table}"`).all().map((row) => {
      for (const key of dates) if (key in row) row[key] = toDate(row[key]);
      for (const key of bools) if (key in row) row[key] = Boolean(row[key]);
      return row;
    });
    const { count } = rows.length
      ? await prisma[model].createMany({ data: rows, skipDuplicates: true })
      : { count: 0 };
    console.log(`${table}: ${count} of ${rows.length} rows copied`);
  }
} finally {
  sqlite.close();
  await prisma.$disconnect();
}
