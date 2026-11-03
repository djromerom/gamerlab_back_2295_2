-- ARK-128 (BG-17): la cuenta del estudiante se conserva entre ediciones; el integrante y el
-- equipo son de una edición. Las restricciones únicas pasan de "toda la BD" a "por edición".
-- No borra ni modifica datos: solo agrega id_edicion al integrante (copiado de su equipo) y
-- cambia índices. Las nuevas restricciones son más débiles que las anteriores, así que los
-- datos actuales siempre las cumplen.

-- 1. id_edicion del integrante = edición de su equipo
ALTER TABLE "integrante" ADD COLUMN "id_edicion" INTEGER;

UPDATE "integrante" AS i
SET "id_edicion" = e."id_edicion"
FROM "equipos" AS e
WHERE e."id_equipo" = i."id_equipo";

ALTER TABLE "integrante" ALTER COLUMN "id_edicion" SET NOT NULL;

ALTER TABLE "integrante"
  ADD CONSTRAINT "integrante_id_edicion_fkey"
  FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "integrante_id_edicion_idx" ON "integrante"("id_edicion");

-- 2. Únicos por edición en el integrante (correo y código estudiantil)
DROP INDEX "integrante_correo_key";
DROP INDEX "integrante_codigo_estudiantil_key";
CREATE UNIQUE INDEX "integrante_correo_id_edicion_key" ON "integrante"("correo", "id_edicion");
CREATE UNIQUE INDEX "integrante_codigo_estudiantil_id_edicion_key" ON "integrante"("codigo_estudiantil", "id_edicion");

-- 3. Únicos por edición en el equipo (líder y nombre)
DROP INDEX "equipos_id_usuario_key";
DROP INDEX "equipos_nombre_equipo_key";
CREATE UNIQUE INDEX "equipos_id_usuario_id_edicion_key" ON "equipos"("id_usuario", "id_edicion");
CREATE UNIQUE INDEX "equipos_nombre_equipo_id_edicion_key" ON "equipos"("nombre_equipo", "id_edicion");
