-- HU-21 (ARK-82): seguimiento por hora de las evaluaciones de cada grupo.
-- Solo datos de permisos; no cambia el esquema. Se crean aquí porque seed.ts no se ejecuta en producción.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ViewEvaluationTracking -> VIEW_EVALUATION_TRACKING -> Profesor (solo lectura, P-26) y Administrador
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-21: la tabla roles esta vacia, se omite (el seed carga el permiso).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES ('VIEW_EVALUATION_TRACKING',
          'Permite ver el seguimiento por hora de las evaluaciones de cada grupo (solo lectura)',
          CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES ('ViewEvaluationTracking',
          'Ver el seguimiento por hora de las evaluaciones de cada grupo',
          CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM "servicio" s
  JOIN "permisos" p ON p."nombre" = 'VIEW_EVALUATION_TRACKING'
  WHERE s."nombre" = 'ViewEvaluationTracking'
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM "roles" r
  JOIN "permisos" p ON p."nombre" = 'VIEW_EVALUATION_TRACKING'
  WHERE r."rol" IN ('Administrador', 'Profesor')
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF NOT EXISTS (
    SELECT 1
    FROM "servicio" s
    JOIN "servicio_permiso" sp ON sp."id_servicio" = s."id_servicio"
    WHERE s."nombre" = 'ViewEvaluationTracking'
  ) THEN
    RAISE EXCEPTION 'HU-21: ViewEvaluationTracking quedo sin permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
