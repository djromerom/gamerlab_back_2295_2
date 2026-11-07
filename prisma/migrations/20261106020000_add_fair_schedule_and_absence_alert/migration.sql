-- ARK-179 (HU-12): cronograma de la feria por edición y permisos de la alerta de inasistencia.
-- Solo agrega una tabla y filas al catálogo RBAC: no cambia ni borra datos existentes.
-- Ninguna edición queda con cronograma: el Administrador lo guarda, con la fecha de la feria.

-- CreateTable
CREATE TABLE "cronograma_feria" (
    "id_cronograma" SERIAL NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "fecha_feria" DATE NOT NULL,
    "hora_inicio" VARCHAR(5) NOT NULL,
    "hora_alerta" VARCHAR(5) NOT NULL,
    "hora_control" VARCHAR(5) NOT NULL,
    "hora_cierre" VARCHAR(5) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "cronograma_feria_pkey" PRIMARY KEY ("id_cronograma")
);

-- CreateIndex
CREATE UNIQUE INDEX "cronograma_feria_id_edicion_key" ON "cronograma_feria"("id_edicion");

-- AddForeignKey
ALTER TABLE "cronograma_feria" ADD CONSTRAINT "cronograma_feria_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permisos de HU-12. Se crean aquí porque seed.ts no se ejecuta en producción.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ViewAbsenceAlert   -> VIEW_ABSENCE_ALERT   -> Administrador y Profesor (solo lectura, P-16 y P-26)
--   ManageFairSchedule -> MANAGE_FAIR_SCHEDULE -> solo Administrador
-- El servicio ListJurors NO se abre a los profesores: también da la lista de jurados con correos.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-12: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES
    ('VIEW_ABSENCE_ALERT', 'Permite ver la alerta de inasistencia y el panel de asistencia de los jurados (solo lectura)', CURRENT_TIMESTAMP),
    ('MANAGE_FAIR_SCHEDULE', 'Permite configurar el cronograma de la feria de una edición', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES
    ('ViewAbsenceAlert', 'Ver la alerta de inasistencia y el panel de asistencia de los jurados de la edición activa', CURRENT_TIMESTAMP),
    ('ManageFairSchedule', 'Consultar y configurar el cronograma de la feria de una edición', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM (VALUES
    ('ViewAbsenceAlert', 'VIEW_ABSENCE_ALERT'),
    ('ManageFairSchedule', 'MANAGE_FAIR_SCHEDULE')
  ) AS v(servicio, permiso)
  JOIN "servicio" s ON s."nombre" = v.servicio
  JOIN "permisos" p ON p."nombre" = v.permiso
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM (VALUES
    ('Administrador', 'VIEW_ABSENCE_ALERT'),
    ('Profesor', 'VIEW_ABSENCE_ALERT'),
    ('Administrador', 'MANAGE_FAIR_SCHEDULE')
  ) AS v(rol, permiso)
  JOIN "roles" r ON r."rol" = v.rol
  JOIN "permisos" p ON p."nombre" = v.permiso
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" IN ('ViewAbsenceAlert', 'ManageFairSchedule')
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-12: un servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
