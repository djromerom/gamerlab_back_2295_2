/*
  Warnings:

  - A unique constraint covering the columns `[codigo_equipo,id_edicion]` on the table `equipos` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."equipos_codigo_equipo_key";

-- AlterTable
ALTER TABLE "equipos" ALTER COLUMN "codigo_equipo" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "equipos_codigo_equipo_id_edicion_key" ON "equipos"("codigo_equipo", "id_edicion");
