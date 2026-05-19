-- AlterTable
ALTER TABLE "archivos_subidos" ADD COLUMN     "entry" TEXT;

-- AlterTable
ALTER TABLE "videojuegos" ADD COLUMN     "archivo_videojuego_url" TEXT,
ADD COLUMN     "entry" TEXT;

-- CreateIndex
CREATE INDEX "usuarios_tipo_jurado_idx" ON "usuarios"("tipo_jurado");
