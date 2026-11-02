-- HU-25 (ARK-124): participación de los jurados por edición.
-- Solo agrega una tabla y un enum: no cambia ni borra datos existentes.

-- CreateEnum
CREATE TYPE "JurorEditionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

-- CreateTable
CREATE TABLE "jurado_edicion" (
    "id_jurado_edicion" SERIAL NOT NULL,
    "id_usuario" TEXT NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "estado" "JurorEditionStatus" NOT NULL DEFAULT 'PENDING',
    "tipo" "JurorType" NOT NULL DEFAULT 'OFFICIAL',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "jurado_edicion_pkey" PRIMARY KEY ("id_jurado_edicion")
);

-- CreateIndex
CREATE INDEX "jurado_edicion_id_edicion_estado_idx" ON "jurado_edicion"("id_edicion", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "jurado_edicion_id_usuario_id_edicion_key" ON "jurado_edicion"("id_usuario", "id_edicion");

-- AddForeignKey
ALTER TABLE "jurado_edicion" ADD CONSTRAINT "jurado_edicion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurado_edicion" ADD CONSTRAINT "jurado_edicion_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permisos de HU-25. Se crean aquí porque seed.ts no se ejecuta en producción.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ListEditionJurors   -> LIST_EDITION_JURORS   -> solo Administrador
--   ManageEditionJurors -> MANAGE_EDITION_JURORS -> solo Administrador
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-25: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  SELECT v."nombre", v."descripcion", CURRENT_TIMESTAMP
  FROM (VALUES
    ('LIST_EDITION_JURORS', 'Permite ver qué jurados participan en cada edición y su estado'),
    ('MANAGE_EDITION_JURORS', 'Permite traer, confirmar, declinar e inscribir jurados de una edición')
  ) AS v("nombre", "descripcion")
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  SELECT v."nombre", v."descripcion", CURRENT_TIMESTAMP
  FROM (VALUES
    ('ListEditionJurors', 'Listar los jurados de una edición con su estado'),
    ('ManageEditionJurors', 'Gestionar los jurados de una edición (traer, confirmar en bloque, inscribir)')
  ) AS v("nombre", "descripcion")
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM (VALUES
    ('ListEditionJurors', 'LIST_EDITION_JURORS'),
    ('ManageEditionJurors', 'MANAGE_EDITION_JURORS')
  ) AS v("servicio", "permiso")
  JOIN "servicio" s ON s."nombre" = v."servicio"
  JOIN "permisos" p ON p."nombre" = v."permiso"
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM "roles" r
  JOIN "permisos" p ON p."nombre" IN ('LIST_EDITION_JURORS', 'MANAGE_EDITION_JURORS')
  WHERE r."rol" = 'Administrador'
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" IN ('ListEditionJurors', 'ManageEditionJurors')
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-25: hay servicios nuevos sin permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
