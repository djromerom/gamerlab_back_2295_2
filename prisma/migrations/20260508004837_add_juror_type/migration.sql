-- CreateEnum
CREATE TYPE "JurorType" AS ENUM ('OFFICIAL', 'BACKUP');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "tipo_jurado" "JurorType";
