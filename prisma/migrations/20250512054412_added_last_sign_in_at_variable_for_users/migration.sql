-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "ultimoInicioSesion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "videojuegos" ALTER COLUMN "id_estado_videojuego" SET DEFAULT 2;
