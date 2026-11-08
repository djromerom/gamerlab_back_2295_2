-- HU-20 (ARK-80): interruptor «mostrar nota final» por edición.
-- La nota final de cada equipo solo la ve el estudiante cuando el administrador la libera
-- (desde las 12:00 del día de la feria). `nota_final_liberada_en` guarda cuándo se liberó.
ALTER TABLE "configuracion_evento"
  ADD COLUMN "mostrar_nota_final" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nota_final_liberada_en" TIMESTAMP(3);
