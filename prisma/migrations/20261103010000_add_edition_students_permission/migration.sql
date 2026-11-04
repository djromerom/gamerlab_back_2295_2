-- ARK-129 (HU-26): permiso para ver los estudiantes de cada edición con su estado.
-- Solo agrega filas al catálogo RBAC: no cambia tablas ni datos de estudiantes.
--
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ListEditionStudents -> LIST_EDITION_STUDENTS -> solo Administrador
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-26: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES ('LIST_EDITION_STUDENTS', 'Permite ver qué estudiantes participan en cada edición y su estado', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES ('ListEditionStudents', 'Listar los estudiantes de una edición con su equipo y su estado', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM "servicio" s
  JOIN "permisos" p ON p."nombre" = 'LIST_EDITION_STUDENTS'
  WHERE s."nombre" = 'ListEditionStudents'
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM "roles" r
  JOIN "permisos" p ON p."nombre" = 'LIST_EDITION_STUDENTS'
  WHERE r."rol" = 'Administrador'
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" = 'ListEditionStudents'
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-26: el servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
