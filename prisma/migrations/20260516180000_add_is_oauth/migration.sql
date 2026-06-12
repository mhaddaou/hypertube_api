-- Drop the global unique index on email
DROP INDEX IF EXISTS "User_email_key";

-- Add the isOauth flag (defaults to false so existing rows remain "local")
ALTER TABLE "User" ADD COLUMN "isOauth" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any user who has a linked OAuthAccount row is OAuth
UPDATE "User" SET "isOauth" = true
WHERE id IN (SELECT DISTINCT "userId" FROM "OAuthAccount");

-- Enforce email uniqueness only for local (non-OAuth) users
CREATE UNIQUE INDEX "User_email_local_key" ON "User"("email") WHERE "isOauth" = false;
