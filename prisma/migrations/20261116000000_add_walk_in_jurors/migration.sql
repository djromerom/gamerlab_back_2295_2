-- HU-24 (ARK-217): alta de un jurado que llegó a la feria sin estar registrado.
-- Solo agrega una columna con valor por defecto: no cambia ninguna fila existente.
ALTER TABLE "jurado_edicion" ADD COLUMN "alta_dia_feria" BOOLEAN NOT NULL DEFAULT false;

-- Permisos de HU-24. Se crean aquí porque seed.ts no se ejecuta en producción.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ManageWalkInJurors -> MANAGE_WALK_IN_JURORS -> ningún rol (solo el Administrador, que pasa todas
--   las verificaciones). El rol Staff NO lo recibe: la decisión del 28 de octubre es que el alta la
--   hace solo el administrador.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-24: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES ('MANAGE_WALK_IN_JURORS', 'Permite dar de alta a un jurado que llegó a la feria sin estar registrado y asignarle grupos', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES ('ManageWalkInJurors', 'Dar de alta a un jurado de último momento, marcar su llegada y asignarle grupos (HU-24)', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM "servicio" s
  JOIN "permisos" p ON p."nombre" = 'MANAGE_WALK_IN_JURORS'
  WHERE s."nombre" = 'ManageWalkInJurors'
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" = 'ManageWalkInJurors'
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-24: el servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
