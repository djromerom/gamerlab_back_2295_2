-- AlterTable
ALTER TABLE "configuracion_evento" ALTER COLUMN "id_edicion" DROP DEFAULT;

-- AlterTable
ALTER TABLE "equipos" ALTER COLUMN "id_edicion" DROP DEFAULT;

-- AlterTable
ALTER TABLE "evaluacion" ALTER COLUMN "id_edicion" DROP DEFAULT;

-- AlterTable
ALTER TABLE "nrc" ALTER COLUMN "id_edicion" DROP DEFAULT;
