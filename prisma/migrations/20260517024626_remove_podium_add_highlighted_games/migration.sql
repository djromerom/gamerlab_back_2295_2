/*
  Warnings:

  - You are about to drop the column `juegos_destacados` on the `ediciones` table. All the data in the column will be lost.
  - You are about to drop the `podio` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."podio" DROP CONSTRAINT "podio_id_edicion_fkey";

-- AlterTable
ALTER TABLE "ediciones" DROP COLUMN "juegos_destacados";

-- DropTable
DROP TABLE "public"."podio";

-- CreateTable
CREATE TABLE "juego_destacado" (
    "id_juego_destacado" SERIAL NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "id_videojuego" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "juego_destacado_pkey" PRIMARY KEY ("id_juego_destacado")
);

-- CreateIndex
CREATE UNIQUE INDEX "juego_destacado_id_edicion_id_videojuego_key" ON "juego_destacado"("id_edicion", "id_videojuego");

-- AddForeignKey
ALTER TABLE "juego_destacado" ADD CONSTRAINT "juego_destacado_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "juego_destacado" ADD CONSTRAINT "juego_destacado_id_videojuego_fkey" FOREIGN KEY ("id_videojuego") REFERENCES "videojuegos"("id_videojuego") ON DELETE RESTRICT ON UPDATE CASCADE;
