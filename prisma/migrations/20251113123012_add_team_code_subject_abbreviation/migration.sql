/*
  Warnings:

  - You are about to drop the column `id_videojuego` on the `archivos_subidos` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[codigo_equipo]` on the table `equipos` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "archivos_subidos" DROP COLUMN "id_videojuego";

-- AlterTable
ALTER TABLE "equipos" ADD COLUMN     "codigo_equipo" VARCHAR(10) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "materia" ADD COLUMN     "abreviacion" CHAR(3) NOT NULL DEFAULT 'IST';

-- AlterTable
ALTER TABLE "videojuegos" ALTER COLUMN "video_url" SET DATA TYPE TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "equipos_codigo_equipo_key" ON "equipos"("codigo_equipo");
