// Grants super admin to an existing account:
//   npm run admin:promote -- someone@example.com
// Handy for the very first admin, before anyone can use the admin UI.
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:promote -- <email>");
  process.exit(1);
}

const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const dbPath = resolve(import.meta.dirname, "..", raw.startsWith("file:") ? raw.slice("file:".length) : raw);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbPath }) });

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account found for ${email}. Register it first, then run this again.`);
    process.exitCode = 1;
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { role: "superadmin", status: "active" } });
    console.log(`${email} is now a super admin. Sign out and back in to see the Admin area.`);
  }
} finally {
  await prisma.$disconnect();
}
