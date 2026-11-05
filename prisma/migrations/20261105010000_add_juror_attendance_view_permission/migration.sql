-- ARK-152 (HU-29): permiso para ver la asistencia de los jurados de la edición activa
-- (quiénes llegaron y quiénes faltan). Solo agrega filas al catálogo RBAC: no cambia tablas.
--
-- Es un servicio distinto de JurorCheckIn a propósito: ver la lista no da permiso para
-- registrar llegadas (HU-12 podrá dar esta lectura a otros roles sin abrir el check-in).
--
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ViewJurorAttendance -> VIEW_JUROR_ATTENDANCE -> Staff (y Administrador por consistencia)
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-29: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES ('VIEW_JUROR_ATTENDANCE', 'Permite ver qué jurados de la edición activa llegaron y cuáles faltan (solo lectura)', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES ('ViewJurorAttendance', 'Ver la asistencia de los jurados de la edición activa (presentes y faltantes)', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM "servicio" s
  JOIN "permisos" p ON p."nombre" = 'VIEW_JUROR_ATTENDANCE'
  WHERE s."nombre" = 'ViewJurorAttendance'
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM "roles" r
  JOIN "permisos" p ON p."nombre" = 'VIEW_JUROR_ATTENDANCE'
  WHERE r."rol" IN ('Administrador', 'Staff')
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" = 'ViewJurorAttendance'
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-29: el servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
