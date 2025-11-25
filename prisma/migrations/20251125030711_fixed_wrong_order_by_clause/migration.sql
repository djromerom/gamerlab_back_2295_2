-- Fix the view by replacing it with the correct ORDER BY clause
CREATE OR REPLACE VIEW public.vw_team_final_scores AS
SELECT
    t.id_equipo AS team_id,
    t.codigo_equipo AS team_code,
    t.externo AS is_external,
    v.id_videojuego AS videogame_id,
    v.nombre AS videogame_name,
    t.id_edicion AS edition_id,
    jr.avg_score AS avg_junior,
    sr.avg_score AS avg_senior,
    CASE
        WHEN t.externo = true THEN COALESCE(jr.avg_score, 0)
        ELSE (
            COALESCE(jr.avg_score, 0) * (
                COALESCE(w.junior_pct, 50) / 100.0
            ) + COALESCE(sr.avg_score, 0) * (
                COALESCE(w.senior_pct, 50) / 100.0
            )
        )
    END AS final_score
FROM
    equipos t
    JOIN videojuegos v ON v.id_equipo = t.id_equipo
    LEFT JOIN (
        SELECT id_videojuego, AVG(puntaje_total) AS avg_score
        FROM evaluacion
        WHERE
            activo = true
            AND es_jurado_senior = false
        GROUP BY
            id_videojuego
    ) jr ON jr.id_videojuego = v.id_videojuego
    LEFT JOIN (
        SELECT id_videojuego, AVG(puntaje_total) AS avg_score
        FROM evaluacion
        WHERE
            activo = true
            AND es_jurado_senior = true
        GROUP BY
            id_videojuego
    ) sr ON sr.id_videojuego = v.id_videojuego
    LEFT JOIN ponderado w ON w.id_edicion = COALESCE(
        t.id_edicion,
        (
            SELECT id
            FROM ediciones
            WHERE
                activo = true
            ORDER BY ediciones.id_edicion DESC
            LIMIT 1
        )
    );