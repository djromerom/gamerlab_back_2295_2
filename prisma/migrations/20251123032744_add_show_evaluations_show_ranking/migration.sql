-- AlterTable
ALTER TABLE "configuracion_evento"
ADD COLUMN "mostrar_evaluaciones" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mostrar_ranking" BOOLEAN NOT NULL DEFAULT false;