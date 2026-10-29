-- BG-03: una sola edición por año y semestre.
-- Si ya hay duplicados, la migración se detiene y los lista para resolverlos a mano.
DO $$
DECLARE
  duplicados TEXT;
BEGIN
  SELECT string_agg(format('%s-%s (ids: %s)', "año", "semestre", ids), '; ')
    INTO duplicados
    FROM (
      SELECT "año", "semestre", string_agg("id_edicion"::text, ', ' ORDER BY "id_edicion") AS ids
        FROM "ediciones"
       GROUP BY "año", "semestre"
      HAVING COUNT(*) > 1
    ) d;

  IF duplicados IS NOT NULL THEN
    RAISE EXCEPTION 'Hay ediciones repetidas con el mismo año y semestre: %. Resuélvelas antes de aplicar esta migración.', duplicados;
  END IF;
END $$;

-- DropIndex
DROP INDEX "ediciones_año_semestre_idx";

-- CreateIndex
CREATE UNIQUE INDEX "ediciones_año_semestre_key" ON "ediciones"("año", "semestre");
