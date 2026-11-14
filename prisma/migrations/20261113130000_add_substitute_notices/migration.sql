-- HU-22 (ARK-84): aviso "Te asignaron grupos" al suplente cuando se le asignan grupos.
-- Solo agrega un enum, dos tablas y filas al catálogo RBAC: no cambia ni borra datos existentes.
--   aviso_suplente: un aviso por operación de asignación; leido_en null = sin leer.
--   aviso_suplente_equipo: grupos del aviso con una foto de código, nombre, videojuego y nivel.
--     Si el equipo se elimina, id_equipo queda en null y el aviso conserva la foto.

-- CreateEnum
CREATE TYPE "SubstituteNoticeEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "aviso_suplente" (
    "id_aviso" SERIAL NOT NULL,
    "id_jurado" TEXT NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leido_en" TIMESTAMP(3),
    "estado_correo" "SubstituteNoticeEmailStatus" NOT NULL DEFAULT 'PENDING',
    "error_correo" VARCHAR(200),

    CONSTRAINT "aviso_suplente_pkey" PRIMARY KEY ("id_aviso")
);

-- CreateTable
CREATE TABLE "aviso_suplente_equipo" (
    "id_aviso_equipo" SERIAL NOT NULL,
    "id_aviso" INTEGER NOT NULL,
    "id_equipo" INTEGER,
    "codigo_equipo" VARCHAR(12) NOT NULL,
    "nombre_equipo" VARCHAR(50) NOT NULL,
    "nombre_videojuego" VARCHAR(30),
    "nivel" INTEGER,

    CONSTRAINT "aviso_suplente_equipo_pkey" PRIMARY KEY ("id_aviso_equipo")
);

-- CreateIndex
CREATE INDEX "aviso_suplente_id_jurado_id_edicion_leido_en_idx" ON "aviso_suplente"("id_jurado", "id_edicion", "leido_en");

-- CreateIndex
CREATE INDEX "aviso_suplente_id_edicion_leido_en_idx" ON "aviso_suplente"("id_edicion", "leido_en");

-- CreateIndex
CREATE INDEX "aviso_suplente_equipo_id_equipo_idx" ON "aviso_suplente_equipo"("id_equipo");

-- CreateIndex
CREATE UNIQUE INDEX "aviso_suplente_equipo_id_aviso_id_equipo_key" ON "aviso_suplente_equipo"("id_aviso", "id_equipo");

-- AddForeignKey
ALTER TABLE "aviso_suplente" ADD CONSTRAINT "aviso_suplente_id_jurado_fkey" FOREIGN KEY ("id_jurado") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_suplente" ADD CONSTRAINT "aviso_suplente_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_suplente_equipo" ADD CONSTRAINT "aviso_suplente_equipo_id_aviso_fkey" FOREIGN KEY ("id_aviso") REFERENCES "aviso_suplente"("id_aviso") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_suplente_equipo" ADD CONSTRAINT "aviso_suplente_equipo_id_equipo_fkey" FOREIGN KEY ("id_equipo") REFERENCES "equipos"("id_equipo") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permisos de HU-22. Se crean aquí porque seed.ts no se ejecuta en producción.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ViewOwnSubstituteNotices -> VIEW_OWN_SUBSTITUTE_NOTICES -> Jurado (los profesores nunca son suplentes)
--   El listado del administrador usa AssignJurors (ya existe, solo Administrador).
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-22: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES ('VIEW_OWN_SUBSTITUTE_NOTICES', 'Permite al jurado suplente ver sus avisos de grupos asignados y marcarlos como leídos', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES ('ViewOwnSubstituteNotices', 'El suplente consulta sus avisos de grupos asignados y los marca como leídos (HU-22)', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM "servicio" s
  JOIN "permisos" p ON p."nombre" = 'VIEW_OWN_SUBSTITUTE_NOTICES'
  WHERE s."nombre" = 'ViewOwnSubstituteNotices'
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM "roles" r
  JOIN "permisos" p ON p."nombre" = 'VIEW_OWN_SUBSTITUTE_NOTICES'
  WHERE r."rol" = 'Jurado'
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" = 'ViewOwnSubstituteNotices'
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-22: el servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
