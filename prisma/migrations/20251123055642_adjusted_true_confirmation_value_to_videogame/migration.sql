/*
  Warnings:

  - You are about to drop the column `id_estado_confirmacion` on the `equipos` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[estado]` on the table `estado_videojuego` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "equipos" DROP COLUMN "id_estado_confirmacion";

-- CreateIndex
CREATE UNIQUE INDEX "estado_videojuego_estado_key" ON "estado_videojuego"("estado");
