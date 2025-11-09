/*
  Warnings:

  - Added the required column `id_videojuego` to the `archivos_subidos` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."detalle_evaluacion" DROP CONSTRAINT "detalle_evaluacion_id_evaluacion_fkey";

-- DropForeignKey
ALTER TABLE "public"."evaluacion" DROP CONSTRAINT "evaluacion_id_videojuego_fkey";

-- DropForeignKey
ALTER TABLE "public"."integrante" DROP CONSTRAINT "integrante_id_equipo_fkey";

-- DropForeignKey
ALTER TABLE "public"."videojuegos" DROP CONSTRAINT "videojuegos_id_equipo_fkey";

-- AlterTable
ALTER TABLE "archivos_subidos" ADD COLUMN     "id_videojuego" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "equipos" ADD COLUMN     "externo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "videojuegos" ADD COLUMN     "repo_url" TEXT,
ADD COLUMN     "video_url" VARCHAR(255);

-- AddForeignKey
ALTER TABLE "integrante" ADD CONSTRAINT "integrante_id_equipo_fkey" FOREIGN KEY ("id_equipo") REFERENCES "equipos"("id_equipo") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "videojuegos" ADD CONSTRAINT "videojuegos_id_equipo_fkey" FOREIGN KEY ("id_equipo") REFERENCES "equipos"("id_equipo") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "evaluacion" ADD CONSTRAINT "evaluacion_id_videojuego_fkey" FOREIGN KEY ("id_videojuego") REFERENCES "videojuegos"("id_videojuego") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "detalle_evaluacion" ADD CONSTRAINT "detalle_evaluacion_id_evaluacion_fkey" FOREIGN KEY ("id_evaluacion") REFERENCES "evaluacion"("id_evaluacion") ON DELETE CASCADE ON UPDATE NO ACTION;