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
            -- Sin nota de jurados: «Nota en proceso». Sin nota del profesor: 100 % jurados (abajo).
            WHEN ed.regla_nota_heredada = false AND jr.avg_score IS NULL THEN NULL
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
