/*
  Warnings:

  - A unique constraint covering the columns `[id_edicion]` on the table `configuracion_evento` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fecha_fin` to the `configuracion_evento` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fecha_inicio` to the `configuracion_evento` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "configuracion_evento" ADD COLUMN     "fecha_fin" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fecha_inicio" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "id_edicion" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "equipos" ALTER COLUMN "id_edicion" SET DEFAULT 3;

-- AlterTable
ALTER TABLE "evaluacion" ALTER COLUMN "id_edicion" SET DEFAULT 3;

-- AlterTable
ALTER TABLE "nrc" ADD COLUMN     "id_edicion" INTEGER NOT NULL DEFAULT 3;

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_evento_id_edicion_key" ON "configuracion_evento"("id_edicion");

-- AddForeignKey
ALTER TABLE "configuracion_evento" ADD CONSTRAINT "configuracion_evento_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nrc" ADD CONSTRAINT "nrc_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;
