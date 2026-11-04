-- HU-04 (ARK-98): un solo cálculo de la nota final, ranking por nivel y registro de desempates.

-- 1) Nota final única (la usan el ranking, el panel de profesores, los reportes y los históricos).
--    Cambios frente a la vista anterior:
--    - Solo entran las 3 primeras evaluaciones junior (jurados) por fecha de envío; las demás se
--      conservan en `evaluacion` y se cuentan aparte (junior_evaluations > junior_counted).
--    - Las evaluaciones senior (profesor) se promedian aparte, todas.
--    - Un grupo de notas que falta no cuenta como 0: si solo hay notas de un grupo, la nota final es
--      ese promedio. Sin ninguna nota, la nota final es NULL (antes 0).
--    - Se usa la ponderación de la edición del equipo; sin ponderación, 50/50 y
--      weighting_configured = false.
--    - Los promedios y la nota final se redondean a 2 decimales (P-04).
--    - Los equipos externos siguen contando solo la nota junior.
DROP VIEW IF EXISTS vw_team_final_scores;

CREATE VIEW vw_team_final_scores AS
WITH ev AS (
    SELECT
        e.id_videojuego,
        e.es_jurado_senior,
        e.puntaje_total,
        ROW_NUMBER() OVER (
            PARTITION BY e.id_videojuego, e.es_jurado_senior
            ORDER BY e.fecha, e.id_evaluacion
        ) AS orden
    FROM evaluacion e
    WHERE e.activo = true
      AND e.puntaje_total IS NOT NULL
),
jr AS (
    SELECT
        id_videojuego,
        AVG(puntaje_total) FILTER (WHERE orden <= 3) AS avg_score,
        COUNT(*) AS total
    FROM ev
    WHERE es_jurado_senior = false
    GROUP BY id_videojuego
),
sr AS (
    SELECT id_videojuego, AVG(puntaje_total) AS avg_score, COUNT(*) AS total
    FROM ev
    WHERE es_jurado_senior = true
    GROUP BY id_videojuego
)
SELECT
    t.id_equipo AS team_id,
    t.codigo_equipo AS team_code,
    t.externo AS is_external,
    v.id_videojuego AS videogame_id,
    v.nombre AS videogame_name,
    t.id_edicion AS edition_id,
    ROUND(jr.avg_score::numeric, 2)::double precision AS avg_junior,
    ROUND(sr.avg_score::numeric, 2)::double precision AS avg_senior,
    ROUND((
        CASE
            WHEN t.externo = true THEN jr.avg_score
            WHEN jr.avg_score IS NULL THEN sr.avg_score
            WHEN sr.avg_score IS NULL THEN jr.avg_score
            ELSE (
                jr.avg_score * COALESCE(w.junior_pct, 50::double precision)
                + sr.avg_score * COALESCE(w.senior_pct, 50::double precision)
            ) / NULLIF(
                COALESCE(w.junior_pct, 50::double precision) + COALESCE(w.senior_pct, 50::double precision),
                0::double precision
            )
        END
    )::numeric, 2)::double precision AS final_score,
    t.nombre_equipo AS team_name,
    v.logo_url AS videogame_logo_url,
    COALESCE(jr.total, 0)::integer AS junior_evaluations,
    LEAST(COALESCE(jr.total, 0), 3)::integer AS junior_counted,
    COALESCE(sr.total, 0)::integer AS senior_evaluations,
    (w.id IS NOT NULL) AS weighting_configured
FROM equipos t
JOIN videojuegos v ON v.id_equipo = t.id_equipo
LEFT JOIN jr ON jr.id_videojuego = v.id_videojuego
LEFT JOIN sr ON sr.id_videojuego = v.id_videojuego
LEFT JOIN ponderado w ON w.id_edicion = t.id_edicion;

-- 2) Desempates registrados (P-05).
CREATE TYPE "TieBreakMethod" AS ENUM ('PROFESSOR', 'REGISTRATION', 'ADMIN');

CREATE TABLE "decision_desempate" (
    "id_decision" SERIAL NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "nivel" INTEGER NOT NULL,
    "nota" DOUBLE PRECISION NOT NULL,
    "clave_empate" VARCHAR(255) NOT NULL,
    "equipos_empatados" INTEGER[],
    "orden_final" INTEGER[],
    "metodo" "TieBreakMethod" NOT NULL,
    "motivo" VARCHAR(500) NOT NULL,
    "id_usuario" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_desempate_pkey" PRIMARY KEY ("id_decision")
);

CREATE UNIQUE INDEX "decision_desempate_clave_empate_key" ON "decision_desempate"("clave_empate");

CREATE INDEX "decision_desempate_id_edicion_nivel_idx" ON "decision_desempate"("id_edicion", "nivel");

ALTER TABLE "decision_desempate" ADD CONSTRAINT "decision_desempate_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "decision_desempate" ADD CONSTRAINT "decision_desempate_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) Ranking oficial por nivel: la posición guardada es dentro del nivel.
ALTER TABLE "resultado_ranking" ADD COLUMN "nivel" INTEGER;
