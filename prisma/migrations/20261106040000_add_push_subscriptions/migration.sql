-- HU-37 (ARK-200): suscripciones a notificaciones push, una por dispositivo.
-- Solo agrega una tabla y filas al catálogo RBAC: no cambia ni borra datos existentes.

-- CreateTable
CREATE TABLE "suscripcion_push" (
    "id_suscripcion" SERIAL NOT NULL,
    "id_usuario" TEXT NOT NULL,
    "endpoint" VARCHAR(2048) NOT NULL,
    "clave_p256dh" VARCHAR(128) NOT NULL,
    "clave_auth" VARCHAR(64) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suscripcion_push_pkey" PRIMARY KEY ("id_suscripcion")
);

-- CreateIndex
CREATE UNIQUE INDEX "suscripcion_push_endpoint_key" ON "suscripcion_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripcion_push_id_usuario_activo_idx" ON "suscripcion_push"("id_usuario", "activo");

-- AddForeignKey
ALTER TABLE "suscripcion_push" ADD CONSTRAINT "suscripcion_push_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permisos de HU-37. Se crean aquí porque seed.ts no se ejecuta en producción.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ManageOwnPushSubscription -> MANAGE_OWN_PUSH_SUBSCRIPTION -> Jurado y Profesor (y Administrador por consistencia)
--   SendPushNotice            -> SEND_PUSH_NOTICE             -> solo Administrador
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-37: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES
    ('MANAGE_OWN_PUSH_SUBSCRIPTION', 'Permite activar y desactivar las notificaciones push en los dispositivos propios', CURRENT_TIMESTAMP),
    ('SEND_PUSH_NOTICE', 'Permite enviar avisos push a los jurados de la edición activa', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES
    ('ManageOwnPushSubscription', 'Suscribir y desuscribir los dispositivos propios a las notificaciones push', CURRENT_TIMESTAMP),
    ('SendPushNotice', 'Enviar un aviso push a los jurados de la edición activa', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM (VALUES
    ('ManageOwnPushSubscription', 'MANAGE_OWN_PUSH_SUBSCRIPTION'),
    ('SendPushNotice', 'SEND_PUSH_NOTICE')
  ) AS v(servicio, permiso)
  JOIN "servicio" s ON s."nombre" = v.servicio
  JOIN "permisos" p ON p."nombre" = v.permiso
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM (VALUES
    ('Administrador', 'MANAGE_OWN_PUSH_SUBSCRIPTION'),
    ('Jurado', 'MANAGE_OWN_PUSH_SUBSCRIPTION'),
    ('Profesor', 'MANAGE_OWN_PUSH_SUBSCRIPTION'),
    ('Administrador', 'SEND_PUSH_NOTICE')
  ) AS v(rol, permiso)
  JOIN "roles" r ON r."rol" = v.rol
  JOIN "permisos" p ON p."nombre" = v.permiso
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" IN ('ManageOwnPushSubscription', 'SendPushNotice')
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-37: un servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
