/*
  Warnings:

  - You are about to drop the column `id_videojuego` on the `archivos_subidos` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('PASSWORD', 'ENTRA_ID');

-- AlterTable
ALTER TABLE "archivos_subidos" DROP COLUMN "id_videojuego";

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "metodo_auth" "AuthMethod" NOT NULL DEFAULT 'PASSWORD',
ADD COLUMN     "microsoft_oid" TEXT;

-- AlterTable
ALTER TABLE "videojuegos" ALTER COLUMN "video_url" SET DATA TYPE TEXT;
