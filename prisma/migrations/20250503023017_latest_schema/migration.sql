/*
  Warnings:

  - You are about to drop the column `estado_confirmacion` on the `equipos` table. All the data in the column will be lost.
  - You are about to drop the column `estado` on the `permisos` table. All the data in the column will be lost.
  - You are about to drop the column `estado` on the `rol_permiso` table. All the data in the column will be lost.
  - You are about to drop the column `estado` on the `roles` table. All the data in the column will be lost.
  - You are about to drop the column `estado` on the `servicio` table. All the data in the column will be lost.
  - You are about to drop the column `estado` on the `servicio_permiso` table. All the data in the column will be lost.
  - Added the required column `actualizado_en` to the `criterios` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizado_en` to the `detalle_evaluacion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizado_en` to the `estado_videojuego` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizado_en` to the `integrante` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actualizado_en` to the `materia` table without a default value. This is not possible if the table is not empty.
  - Made the column `codigo` on table `materia` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `actualizado_en` to the `nrc` table without a default value. This is not possible if the table is not empty.
  - Made the column `id_estado_confirmacion` on table `usuarios` required. This step will fail if there are existing NULL values in that column.
  - Made the column `activo` on table `usuarios` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_id_estado_confirmacion_fkey";

-- AlterTable
ALTER TABLE "criterios" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "actualizado_en" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "detalle_evaluacion" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "actualizado_en" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "equipos" DROP COLUMN "estado_confirmacion",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "id_estado_confirmacion" INTEGER NOT NULL DEFAULT 2,
ALTER COLUMN "id_edicion" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "estado_videojuego" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "actualizado_en" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "estados_confirmacion" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "evaluacion" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "integrante" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "actualizado_en" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "materia" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "actualizado_en" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "codigo" SET NOT NULL;

-- AlterTable
ALTER TABLE "nrc" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "actualizado_en" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "permisos" DROP COLUMN "estado",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "rol_permiso" DROP COLUMN "estado",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "actualizado_en" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "estado",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "servicio" DROP COLUMN "estado",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "servicio_permiso" DROP COLUMN "estado",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "actualizado_en" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "usuarios" ALTER COLUMN "id_estado_confirmacion" SET NOT NULL,
ALTER COLUMN "id_estado_confirmacion" SET DEFAULT 2,
ALTER COLUMN "activo" SET NOT NULL,
ALTER COLUMN "activo" SET DEFAULT true;

-- AlterTable
ALTER TABLE "videojuegos" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_estado_confirmacion_fkey" FOREIGN KEY ("id_estado_confirmacion") REFERENCES "estados_confirmacion"("id_estado") ON DELETE RESTRICT ON UPDATE CASCADE;
