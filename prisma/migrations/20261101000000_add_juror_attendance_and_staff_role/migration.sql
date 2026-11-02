-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('QR', 'MANUAL');

-- CreateTable
CREATE TABLE "asistencia_jurado" (
    "id_asistencia" SERIAL NOT NULL,
    "id_usuario" TEXT NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "registrado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrado_por" TEXT NOT NULL,
    "metodo" "CheckInMethod" NOT NULL,
    "id_escarapela" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "asistencia_jurado_pkey" PRIMARY KEY ("id_asistencia")
);

-- CreateIndex
CREATE INDEX "asistencia_jurado_id_edicion_idx" ON "asistencia_jurado"("id_edicion");

-- AddForeignKey
ALTER TABLE "asistencia_jurado" ADD CONSTRAINT "asistencia_jurado_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_jurado" ADD CONSTRAINT "asistencia_jurado_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_jurado" ADD CONSTRAINT "asistencia_jurado_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_jurado" ADD CONSTRAINT "asistencia_jurado_id_escarapela_fkey" FOREIGN KEY ("id_escarapela") REFERENCES "escarapelas_jurado"("id_escarapela") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un jurado tiene a lo sumo un registro de llegada activo por edición (índice parcial: no lo expresa Prisma).
-- Así, dos escaneos simultáneos del mismo QR no duplican el registro.
CREATE UNIQUE INDEX "asistencia_jurado_activa_unica"
    ON "asistencia_jurado"("id_usuario", "id_edicion")
    WHERE "activo" = true;

-- HU-11: rol Staff (mesa de escarapelas), check-in y creación de cuentas de staff.
-- Se crean aquí porque seed.ts no se ejecuta en producción. Todo se resuelve por NOMBRE:
-- los ids difieren entre local, Arkad-test y producción. Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   JurorCheckIn        -> JUROR_CHECK_IN        -> Staff (y Administrador por consistencia)
--   ManageStaffAccounts -> MANAGE_STAFF_ACCOUNTS -> solo Administrador
--   Staff también recibe el permiso de GetMyProfile, como los demás roles.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-11: la tabla roles esta vacia, se omite (el seed carga el rol Staff y sus permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('roles', 'id_rol'),
                 COALESCE((SELECT MAX("id_rol") FROM "roles"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  -- 1) Rol
  INSERT INTO "roles" ("rol", "descripcion", "actualizado_en")
  VALUES ('Staff', 'Personal de la mesa de escarapelas: registra la llegada de los jurados', CURRENT_TIMESTAMP)
  ON CONFLICT ("rol") DO NOTHING;

  -- 2) Permisos
  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  SELECT v."nombre", v."descripcion", CURRENT_TIMESTAMP
  FROM (VALUES
    ('JUROR_CHECK_IN', 'Permite registrar la llegada de un jurado con su QR o buscándolo por nombre'),
    ('MANAGE_STAFF_ACCOUNTS', 'Permite crear cuentas del rol Staff (solo Administrador)')
  ) AS v("nombre", "descripcion")
  ON CONFLICT ("nombre") DO NOTHING;

  -- 3) Servicios
  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  SELECT v."nombre", v."descripcion", CURRENT_TIMESTAMP
  FROM (VALUES
    ('JurorCheckIn', 'Registrar la llegada de jurados (escaneo de QR y búsqueda manual)'),
    ('ManageStaffAccounts', 'Crear cuentas del rol Staff')
  ) AS v("nombre", "descripcion")
  ON CONFLICT ("nombre") DO NOTHING;

  -- 4) Servicio -> permiso
  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM (VALUES
    ('JurorCheckIn', 'JUROR_CHECK_IN'),
    ('ManageStaffAccounts', 'MANAGE_STAFF_ACCOUNTS')
  ) AS v("servicio", "permiso")
  JOIN "servicio" s ON s."nombre" = v."servicio"
  JOIN "permisos" p ON p."nombre" = v."permiso"
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  -- 5) Rol -> permiso (el perfil propio usa el permiso de GetMyProfile, sea cual sea su nombre)
  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM (VALUES
    ('Administrador', 'JUROR_CHECK_IN'),
    ('Administrador', 'MANAGE_STAFF_ACCOUNTS'),
    ('Staff', 'JUROR_CHECK_IN')
  ) AS v("rol", "permiso")
  JOIN "roles" r ON r."rol" = v."rol"
  JOIN "permisos" p ON p."nombre" = v."permiso"
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", sp."id_permiso"
  FROM "roles" r
  JOIN "servicio" s ON s."nombre" = 'GetMyProfile'
  JOIN "servicio_permiso" sp ON sp."id_servicio" = s."id_servicio"
  WHERE r."rol" = 'Staff'
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- 6) Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" IN ('JurorCheckIn', 'ManageStaffAccounts')
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-11: hay servicios nuevos sin permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
