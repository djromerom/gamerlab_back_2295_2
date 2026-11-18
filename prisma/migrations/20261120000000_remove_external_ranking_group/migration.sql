-- BG-69 (ARK-272): se quita el grupo «Externos» del ranking y la casilla «Externo» deja de cambiar
-- la nota y el nivel del equipo.
--
-- Decisión de Allison (16-nov): en Arkad solo hay estudiantes Uninorte, colegios y presentadores
-- externos (que no se califican y solo reciben certificado, HU-39). No existe un grupo «Externos»
-- calificable. `equipos.externo` queda solo como dato informativo (etiqueta de la galería).
--
-- 1) vw_team_final_scores: igual que en 20261113120000_hide_rejected_team_scores, pero la rama
--    `WHEN t.externo = true THEN jr.avg_score` ya no aplica a la edición vigente: la nota de un
--    equipo marcado se calcula con los porcentajes de HU-34 como la de cualquier otro. Se conserva
--    solo para las ediciones congeladas (`regla_nota_heredada = true`, anteriores a HU-34) para no
--    cambiar notas ya publicadas. La columna `is_external` se conserva.
-- 2) Se borran los datos que solo existían para el grupo «Externos» (HU-38, ARK-219, migración
--    20261115120000_add_external_ranking_group): los desempates resueltos en ese grupo y sus
--    posiciones guardadas en el ranking final. No se tocan evaluaciones ni notas. Las posiciones
--    guardadas de los niveles no se recalculan: el ranking final se vuelve a definir desde la
--    pantalla (`POST /ranking/finalize`), y mientras tanto el ranking dice que ya no coincide.
-- 3) Se quitan las columnas `grupo_externo` y `decision_desempate.nivel` vuelve a ser obligatorio.
--
-- Antes de aplicarla se puede contar lo que se borra:
--   SELECT count(*) FROM decision_desempate WHERE grupo_externo = true OR nivel IS NULL;
--   SELECT count(*) FROM resultado_ranking WHERE grupo_externo = true;

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
            WHEN ed.regla_nota_heredada = false AND t.codigo_equipo LIKE 'N0-%' THEN sr.avg_score
            WHEN ed.regla_nota_heredada = true AND t.externo = true THEN jr.avg_score
            WHEN ed.regla_nota_heredada = false
                AND (jr.avg_score IS NULL OR sr.avg_score IS NULL) THEN NULL
            WHEN jr.avg_score IS NULL THEN sr.avg_score
            WHEN sr.avg_score IS NULL THEN jr.avg_score
            ELSE (
                jr.avg_score * pct.junior_pct + sr.avg_score * pct.senior_pct
            ) / NULLIF(pct.junior_pct + pct.senior_pct, 0::double precision)
        END
    )::numeric, 2)::double precision AS final_score,
    t.nombre_equipo AS team_name,
    v.logo_url AS videogame_logo_url,
    COALESCE(jr.total, 0)::integer AS junior_evaluations,
    LEAST(COALESCE(jr.total, 0), 3)::integer AS junior_counted,
    COALESCE(sr.total, 0)::integer AS senior_evaluations,
    (w.id IS NOT NULL) AS weighting_configured,
    ed.regla_nota_heredada AS legacy_final_score_rule
FROM equipos t
JOIN videojuegos v ON v.id_equipo = t.id_equipo
JOIN estado_videojuego st ON st.id_estado = v.id_estado_videojuego
JOIN ediciones ed ON ed.id_edicion = t.id_edicion
LEFT JOIN jr ON jr.id_videojuego = v.id_videojuego
LEFT JOIN sr ON sr.id_videojuego = v.id_videojuego
LEFT JOIN ponderado w ON w.id_edicion = t.id_edicion
CROSS JOIN LATERAL (
    SELECT
        COALESCE(w.junior_pct, CASE WHEN ed.regla_nota_heredada THEN 50 ELSE 40 END::double precision) AS junior_pct,
        COALESCE(w.senior_pct, CASE WHEN ed.regla_nota_heredada THEN 50 ELSE 60 END::double precision) AS senior_pct
) pct
WHERE t.no_calificable = false
  AND st.estado <> 'RECHAZADO';

DELETE FROM "decision_desempate" WHERE "grupo_externo" = true OR "nivel" IS NULL;
DELETE FROM "resultado_ranking" WHERE "grupo_externo" = true;

ALTER TABLE "decision_desempate" ALTER COLUMN "nivel" SET NOT NULL;
ALTER TABLE "decision_desempate" DROP COLUMN "grupo_externo";
ALTER TABLE "resultado_ranking" DROP COLUMN "grupo_externo";
