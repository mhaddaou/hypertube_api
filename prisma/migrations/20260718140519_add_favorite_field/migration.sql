-- AlterTable
ALTER TABLE "UserMovie" ADD COLUMN     "favoritedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "UserMovie_userId_favoritedAt_idx" ON "UserMovie"("userId", "favoritedAt");
