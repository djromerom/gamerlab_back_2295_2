/*
  Warnings:

  - You are about to drop the column `fecha_fin` on the `configuracion_evento` table. All the data in the column will be lost.
  - You are about to drop the column `fecha_inicio` on the `configuracion_evento` table. All the data in the column will be lost.
  - You are about to drop the column `fecha` on the `ediciones` table. All the data in the column will be lost.
  - You are about to drop the column `nombre` on the `ediciones` table. All the data in the column will be lost.
  - You are about to drop the column `nombre_semestre` on the `ediciones` table. All the data in the column will be lost.
  - Added the required column `inicia_en` to the `ediciones` table without a default value. This is not possible if the table is not empty.
  - Added the required column `termina_en` to the `ediciones` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `semestre` on the `ediciones` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `titulo` on table `ediciones` required. This step will fail if there are existing NULL values in that column.
  - Made the column `año` on table `ediciones` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "public"."ediciones_semestre_key";

-- AlterTable
ALTER TABLE "configuracion_evento" DROP COLUMN "fecha_fin",
DROP COLUMN "fecha_inicio";

-- AlterTable
ALTER TABLE "ediciones" DROP COLUMN "fecha",
DROP COLUMN "nombre",
DROP COLUMN "nombre_semestre",
ADD COLUMN     "foto_principal" TEXT,
ADD COLUMN     "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "inicia_en" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "termina_en" TIMESTAMP(3) NOT NULL,
DROP COLUMN "semestre",
ADD COLUMN     "semestre" INTEGER NOT NULL,
ALTER COLUMN "titulo" SET NOT NULL,
ALTER COLUMN "año" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ediciones_año_semestre_idx" ON "ediciones"("año", "semestre");
