-- HU-17 (ARK-183): encuesta de experiencia del jurado. Una respuesta por jurado y edición.
-- Solo agrega una tabla y filas al catálogo RBAC: no cambia ni borra datos existentes.

-- CreateTable
CREATE TABLE "respuesta_encuesta_jurado" (
    "id_respuesta" SERIAL NOT NULL,
    "id_jurado" TEXT NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "facilidad_ingreso" INTEGER NOT NULL,
    "claridad_grupos" INTEGER NOT NULL,
    "facilidad_calificar" INTEGER NOT NULL,
    "estabilidad" INTEGER NOT NULL,
    "organizacion_feria" INTEGER NOT NULL,
    "experiencia_general" INTEGER NOT NULL,
    "comentarios" VARCHAR(1000),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "respuesta_encuesta_jurado_pkey" PRIMARY KEY ("id_respuesta")
);

-- CreateIndex
CREATE INDEX "respuesta_encuesta_jurado_id_edicion_activo_idx" ON "respuesta_encuesta_jurado"("id_edicion", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "respuesta_encuesta_jurado_id_jurado_id_edicion_key" ON "respuesta_encuesta_jurado"("id_jurado", "id_edicion");

-- AddForeignKey
ALTER TABLE "respuesta_encuesta_jurado" ADD CONSTRAINT "respuesta_encuesta_jurado_id_jurado_fkey" FOREIGN KEY ("id_jurado") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_encuesta_jurado" ADD CONSTRAINT "respuesta_encuesta_jurado_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Cada campo de 1 a 5 (P-13), también a nivel de BD.
ALTER TABLE "respuesta_encuesta_jurado" ADD CONSTRAINT "respuesta_encuesta_jurado_campos_1_5_check" CHECK (
  "facilidad_ingreso" BETWEEN 1 AND 5 AND
  "claridad_grupos" BETWEEN 1 AND 5 AND
  "facilidad_calificar" BETWEEN 1 AND 5 AND
  "estabilidad" BETWEEN 1 AND 5 AND
  "organizacion_feria" BETWEEN 1 AND 5 AND
  "experiencia_general" BETWEEN 1 AND 5
);

-- Permisos de HU-17. Se crean aquí porque seed.ts no se ejecuta en producción.
-- Todo se resuelve por NOMBRE (los ids difieren entre local, Arkad-test y producción). Es idempotente.
-- En una base nueva (sin roles) no hace nada: los inserta prisma/seed-data.json.
--   AnswerJurorSurvey      -> ANSWER_JUROR_SURVEY       -> Jurado y Profesor
--   ViewJurorSurveyResults -> VIEW_JUROR_SURVEY_RESULTS -> solo Administrador (se salta la verificación)
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-17: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explícitos: se resincronizan las secuencias.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  VALUES
    ('ANSWER_JUROR_SURVEY', 'Permite al jurado responder la encuesta de experiencia de la edición', CURRENT_TIMESTAMP),
    ('VIEW_JUROR_SURVEY_RESULTS', 'Permite ver y exportar los resultados de la encuesta de experiencia de los jurados', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  VALUES
    ('AnswerJurorSurvey', 'Consultar y responder la encuesta de experiencia del jurado (HU-17)', CURRENT_TIMESTAMP),
    ('ViewJurorSurveyResults', 'Resumen y exportación de la encuesta de experiencia de los jurados (HU-17)', CURRENT_TIMESTAMP)
  ON CONFLICT ("nombre") DO NOTHING;

  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM (VALUES
    ('AnswerJurorSurvey', 'ANSWER_JUROR_SURVEY'),
    ('ViewJurorSurveyResults', 'VIEW_JUROR_SURVEY_RESULTS')
  ) AS v(servicio, permiso)
  JOIN "servicio" s ON s."nombre" = v.servicio
  JOIN "permisos" p ON p."nombre" = v.permiso
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM (VALUES
    ('Jurado', 'ANSWER_JUROR_SURVEY'),
    ('Profesor', 'ANSWER_JUROR_SURVEY')
  ) AS v(rol, permiso)
  JOIN "roles" r ON r."rol" = v.rol
  JOIN "permisos" p ON p."nombre" = v.permiso
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- Salvaguarda: un servicio sin permiso queda abierto a cualquier usuario con sesión.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" IN ('AnswerJurorSurvey', 'ViewJurorSurveyResults')
      AND NOT EXISTS (SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio")
  ) THEN
    RAISE EXCEPTION 'HU-17: un servicio nuevo no tiene permiso asociado; se revierte la migracion.';
  END IF;
END
$migration$;
