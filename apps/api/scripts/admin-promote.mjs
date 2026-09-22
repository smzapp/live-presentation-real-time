// Grants super admin to an existing account:
//   npm run admin:promote -- someone@example.com
// Handy for the very first admin, before anyone can use the admin UI.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:promote -- <email>");
  process.exit(1);
}

const envPath = resolve(import.meta.dirname, "..", ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (see apps/api/.env).");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

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
