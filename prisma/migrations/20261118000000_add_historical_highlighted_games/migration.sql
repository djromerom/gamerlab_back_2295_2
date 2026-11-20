-- HU-41 (ARK-229): destacar juegos de cualquier edición, también los ya archivados.
--
-- juego_destacado apunta a un videojuego en vivo (id_videojuego) O a uno histórico
-- (id_videojuego_historico), nunca a los dos ni a ninguno (CHECK, Prisma no lo expresa).
--
-- Solo agrega: las filas actuales tienen id_videojuego y quedan como están (cumplen el CHECK).
-- Borrar un videojuego histórico borra su destacado (ON DELETE CASCADE).

ALTER TABLE "juego_destacado"
  ALTER COLUMN "id_videojuego" DROP NOT NULL,
  ADD COLUMN "id_videojuego_historico" INTEGER;

CREATE UNIQUE INDEX "juego_destacado_id_edicion_id_videojuego_historico_key"
  ON "juego_destacado"("id_edicion", "id_videojuego_historico");

ALTER TABLE "juego_destacado"
  ADD CONSTRAINT "juego_destacado_id_videojuego_historico_fkey"
    FOREIGN KEY ("id_videojuego_historico")
    REFERENCES "videojuegos_historico"("id_videojuego_historico")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "juego_destacado"
  ADD CONSTRAINT "juego_destacado_un_videojuego_check"
    CHECK (num_nonnulls("id_videojuego", "id_videojuego_historico") = 1);
