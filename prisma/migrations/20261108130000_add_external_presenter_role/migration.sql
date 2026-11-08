-- HU-33 (ARK-194): rol «Presentador externo» y presentadores por edición.
-- Agrega una tabla, un rol y filas al catálogo RBAC: no cambia ni borra datos existentes.

-- CreateTable
CREATE TABLE "presentador_edicion" (
    "id_presentador" SERIAL NOT NULL,
    "id_usuario" TEXT NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "organizacion" VARCHAR(150),
    "titulo_presentacion" VARCHAR(200),
    "certificado_enviado_en" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "presentador_edicion_pkey" PRIMARY KEY ("id_presentador")
);

-- CreateIndex
CREATE INDEX "presentador_edicion_id_edicion_activo_idx" ON "presentador_edicion"("id_edicion", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "presentador_edicion_id_usuario_id_edicion_key" ON "presentador_edicion"("id_usuario", "id_edicion");

-- AddForeignKey
ALTER TABLE "presentador_edicion" ADD CONSTRAINT "presentador_edicion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentador_edicion" ADD CONSTRAINT "presentador_edicion_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Rol y permisos de HU-33. Se crean aquí porque seed.ts no se ejecuta en producción.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ManageExternalPresenters        -> MANAGE_EXTERNAL_PRESENTERS          -> solo Administrador
--   ViewOwnExternalPresenterProfile -> VIEW_OWN_EXTERNAL_PRESENTER_PROFILE -> Presentador externo
--   Presentador externo también recibe el permiso de GetMyProfile, como los demás roles.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-33: la tabla roles esta vacia, se omite (el seed carga el rol y sus permisos).';
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
  VALUES ('Presentador externo', 'Asiste a la feria sin ser calificado; solo recibe el certificado de asistencia', CURRENT_TIMESTAMP)
  ON CONFLICT ("rol") DO NOTHING;

  -- 2) Permisos
  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES
    ('MANAGE_EXTERNAL_PRESENTERS', 'Permite registrar, editar, quitar, exportar y certificar a los presentadores externos de la edición', CURRENT_TIMESTAMP),
    ('VIEW_OWN_EXTERNAL_PRESENTER_PROFILE', 'Permite al presentador externo ver su propio registro en la edición', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  -- 3) Servicios
  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES
    ('ManageExternalPresenters', 'Presentadores externos de la edición (HU-33): alta, lista, edición, retiro, Excel y certificado', CURRENT_TIMESTAMP),
    ('ViewOwnExternalPresenterProfile', 'El presentador externo consulta su registro en la edición (HU-33)', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  -- 4) Servicio -> permiso
  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM (VALUES
    ('ManageExternalPresenters', 'MANAGE_EXTERNAL_PRESENTERS'),
    ('ViewOwnExternalPresenterProfile', 'VIEW_OWN_EXTERNAL_PRESENTER_PROFILE')
  ) AS v(servicio, permiso)
  JOIN "servicio" s ON s."nombre" = v.servicio
  JOIN "permisos" p ON p."nombre" = v.permiso
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  -- 5) Rol -> permiso
  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM (VALUES
    ('Presentador externo', 'VIEW_OWN_EXTERNAL_PRESENTER_PROFILE')
  ) AS v(rol, permiso)
  JOIN "roles" r ON r."rol" = v.rol
  JOIN "permisos" p ON p."nombre" = v.permiso
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- El perfil propio usa el permiso de GetMyProfile, sea cual sea su nombre (como Staff en HU-11).
  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", sp."id_permiso"
  FROM "roles" r
  JOIN "servicio" s ON s."nombre" = 'GetMyProfile'
  JOIN "servicio_permiso" sp ON sp."id_servicio" = s."id_servicio"
  WHERE r."rol" = 'Presentador externo'
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- 6) Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" IN ('ManageExternalPresenters', 'ViewOwnExternalPresenterProfile')
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-33: un servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
