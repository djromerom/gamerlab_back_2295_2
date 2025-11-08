-- AlterTable
ALTER TABLE "videojuegos" ADD COLUMN     "imagenes_adicionales" TEXT[] DEFAULT ARRAY[]::TEXT[];
