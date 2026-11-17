-- BG-49 (ARK-251): el Administrador anula una llegada de jurado registrada por error.
-- Solo agrega columnas opcionales: no cambia ninguna fila existente. La llegada anulada queda en la
-- tabla con "activo" = false, quién la anuló, cuándo y el motivo (borrado lógico).
-- El índice único parcial "asistencia_jurado_activa_unica" (WHERE "activo" = true) ya permite volver
-- a registrar la llegada del mismo jurado después de anularla: no se toca.
ALTER TABLE "asistencia_jurado" ADD COLUMN "anulado_en" TIMESTAMP(3),
ADD COLUMN "anulado_por" TEXT,
ADD COLUMN "motivo_anulacion" VARCHAR(500);

-- AddForeignKey
ALTER TABLE "asistencia_jurado" ADD CONSTRAINT "asistencia_jurado_anulado_por_fkey" FOREIGN KEY ("anulado_por") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permiso de BG-49. Se crea aquí porque seed.ts no se ejecuta en producción.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   AnnulJurorArrival -> ANNUL_JUROR_ARRIVAL -> ningún rol (solo el Administrador, que pasa todas
--   las verificaciones). El rol Staff NO lo recibe: registra llegadas, pero no las anula.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'BG-49: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES ('ANNUL_JUROR_ARRIVAL', 'Permite anular la llegada de un jurado registrada por error', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES ('AnnulJurorArrival', 'Anular la llegada de un jurado registrada por error; queda registro de quién y cuándo (BG-49)', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM "servicio" s
  JOIN "permisos" p ON p."nombre" = 'ANNUL_JUROR_ARRIVAL'
  WHERE s."nombre" = 'AnnulJurorArrival'
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" = 'AnnulJurorArrival'
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'BG-49: el servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
