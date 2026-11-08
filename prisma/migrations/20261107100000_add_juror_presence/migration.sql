-- ARK-86 (HU-23): presencia del jurado durante la feria.
-- Agrega columnas con valor por defecto (no cambia datos existentes) y filas del catálogo RBAC.
--   asistencia_jurado.ultima_confirmacion_presencia: último "Sigo aquí" del jurado.
--   configuracion_evento.presencia_*_min: parámetros por edición (60, 15 y 45 minutos).

-- AlterTable
ALTER TABLE "asistencia_jurado" ADD COLUMN "ultima_confirmacion_presencia" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "configuracion_evento" ADD COLUMN "presencia_pregunta_min" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "presencia_respuesta_min" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN "presencia_inactividad_min" INTEGER NOT NULL DEFAULT 45;

-- Permisos. Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción).
-- Es idempotente. En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ManageJurorPresence  -> MANAGE_JUROR_PRESENCE -> Administrador (ver estados y parámetros)
--   ConfirmJurorPresence -> ADD_EVALUATION (ya existe) -> quienes califican: Jurado y Profesor
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-23: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES ('MANAGE_JUROR_PRESENCE', 'Permite ver la presencia de los jurados durante la feria y cambiar sus parámetros', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES ('ManageJurorPresence', 'Ver los indicadores de presencia de los jurados de la edición activa y sus parámetros', CURRENT_TIMESTAMP),
         ('ConfirmJurorPresence', 'El jurado consulta cuándo debe confirmar su presencia y responde "Sigo aquí"', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM "servicio" s
  JOIN "permisos" p ON p."nombre" = 'MANAGE_JUROR_PRESENCE'
  WHERE s."nombre" = 'ManageJurorPresence'
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  -- Mismo permiso que calificar: quien puede calificar es quien responde "Sigo aquí".
  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM "servicio" s
  JOIN "permisos" p ON p."nombre" = 'ADD_EVALUATION'
  WHERE s."nombre" = 'ConfirmJurorPresence'
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM "roles" r
  JOIN "permisos" p ON p."nombre" = 'MANAGE_JUROR_PRESENCE'
  WHERE r."rol" = 'Administrador'
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" IN ('ManageJurorPresence', 'ConfirmJurorPresence')
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-23: un servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
