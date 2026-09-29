-- Accounts that existed before email confirmation was added are treated as
-- confirmed: they were created when nobody was asked to confirm anything, so
-- asking them now would be a banner they never earned. Only accounts created
-- from here on start out unconfirmed.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
