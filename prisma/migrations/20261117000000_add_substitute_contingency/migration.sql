-- HU-14 (ARK-213): contingencia con suplentes.
--
-- 1) configuracion_evento.minimo_evaluaciones: mínimo de evaluaciones por grupo (3 por defecto).
--    Define qué grupos están en riesgo y cuántos suplentes se sugieren. No cambia la regla de la
--    nota: solo cuentan las 3 primeras evaluaciones (P-10, vw_team_final_scores).
-- 2) rechazo_sugerencia_suplente: registro de las sugerencias que el administrador rechazó.
--
-- No borra ni cambia datos: las ediciones existentes quedan con mínimo 3.

ALTER TABLE "configuracion_evento"
  ADD COLUMN "minimo_evaluaciones" INTEGER NOT NULL DEFAULT 3,
  ADD CONSTRAINT "configuracion_evento_minimo_evaluaciones_check"
    CHECK ("minimo_evaluaciones" BETWEEN 1 AND 10);

CREATE TABLE "rechazo_sugerencia_suplente" (
    "id_rechazo" SERIAL NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "id_equipo" INTEGER NOT NULL,
    "id_suplente" TEXT,
    "motivo" VARCHAR(500),
    "rechazado_por" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rechazo_sugerencia_suplente_pkey" PRIMARY KEY ("id_rechazo")
);

CREATE INDEX "rechazo_sugerencia_suplente_id_edicion_id_equipo_idx"
  ON "rechazo_sugerencia_suplente"("id_edicion", "id_equipo");
