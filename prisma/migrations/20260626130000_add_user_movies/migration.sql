-- CreateTable
CREATE TABLE "UserMovie" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieId" INTEGER NOT NULL,
    "watchlistedAt" TIMESTAMP(3),
    "watchedAt" TIMESTAMP(3),
    "title" TEXT,
    "year" INTEGER,
    "rating" DOUBLE PRECISION,
    "plot" TEXT,
    "image" TEXT,
    "coverImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMovie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMovie_userId_movieId_key" ON "UserMovie"("userId", "movieId");

-- CreateIndex
CREATE INDEX "UserMovie_userId_watchlistedAt_idx" ON "UserMovie"("userId", "watchlistedAt");

-- CreateIndex
CREATE INDEX "UserMovie_userId_watchedAt_idx" ON "UserMovie"("userId", "watchedAt");

-- AddForeignKey
ALTER TABLE "UserMovie" ADD CONSTRAINT "UserMovie_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
