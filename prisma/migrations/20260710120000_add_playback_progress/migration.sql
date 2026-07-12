-- Add playback progress fields for continue-watching/resume support.
ALTER TABLE "UserMovie"
ADD COLUMN "playbackPositionSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "playbackDurationSeconds" DOUBLE PRECISION,
ADD COLUMN "playbackUpdatedAt" TIMESTAMP(3);

-- Speed up per-user continue-watching queries.
CREATE INDEX "UserMovie_userId_playbackUpdatedAt_idx"
ON "UserMovie"("userId", "playbackUpdatedAt");
