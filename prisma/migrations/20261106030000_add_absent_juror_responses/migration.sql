-- ARK-181 (HU-13): historial de las respuestas que los profesores averiguan sobre los jurados
-- que no llegaron y que el administrador registra. Solo agrega una tabla, un enum y filas del
-- catálogo RBAC: no cambia ni rellena datos existentes. Sin columna de teléfono (HU-13).

-- CreateEnum
CREATE TYPE "AbsentJurorResponseResult" AS ENUM ('ON_THE_WAY', 'CANNOT_ATTEND', 'NO_RESPONSE');

-- CreateTable
CREATE TABLE "respuesta_jurado_ausente" (
    "id_respuesta" SERIAL NOT NULL,
    "id_usuario" TEXT NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "resultado" "AbsentJurorResponseResult" NOT NULL,
    "hora_estimada" TIMESTAMP(3),
    "registrado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrado_por" TEXT NOT NULL,

    CONSTRAINT "respuesta_jurado_ausente_pkey" PRIMARY KEY ("id_respuesta")
);

-- CreateIndex
CREATE INDEX "respuesta_jurado_ausente_id_edicion_id_usuario_registrado_e_idx" ON "respuesta_jurado_ausente"("id_edicion", "id_usuario", "registrado_en");

-- AddForeignKey
ALTER TABLE "respuesta_jurado_ausente" ADD CONSTRAINT "respuesta_jurado_ausente_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_jurado_ausente" ADD CONSTRAINT "respuesta_jurado_ausente_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_jurado_ausente" ADD CONSTRAINT "respuesta_jurado_ausente_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permiso: registrar y consultar van juntos y son solo del Administrador.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   ManageAbsentJurorResponses -> MANAGE_ABSENT_JUROR_RESPONSES -> Administrador
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-13: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES ('MANAGE_ABSENT_JUROR_RESPONSES', 'Permite registrar y consultar las respuestas sobre los jurados que no llegaron', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES ('ManageAbsentJurorResponses', 'Registrar y consultar las respuestas sobre los jurados ausentes de la edición activa', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM "servicio" s
  JOIN "permisos" p ON p."nombre" = 'MANAGE_ABSENT_JUROR_RESPONSES'
  WHERE s."nombre" = 'ManageAbsentJurorResponses'
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM "roles" r
  JOIN "permisos" p ON p."nombre" = 'MANAGE_ABSENT_JUROR_RESPONSES'
  WHERE r."rol" = 'Administrador'
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" = 'ManageAbsentJurorResponses'
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-13: el servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
