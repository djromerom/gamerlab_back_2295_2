-- AlterTable
ALTER TABLE "videojuegos"
  ADD COLUMN IF NOT EXISTS "video_url" TEXT,
  ADD COLUMN IF NOT EXISTS "repo_url" TEXT;

