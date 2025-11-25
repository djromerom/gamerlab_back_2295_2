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
    WHEN (t.externo = TRUE) THEN COALESCE(jr.avg_score, (0) :: double precision)
    ELSE (
      (
        COALESCE(jr.avg_score, (0) :: double precision) * (
          COALESCE(w.junior_pct, (50) :: double precision) / (100.0) :: double precision
        )
      ) + (
        COALESCE(sr.avg_score, (0) :: double precision) * (
          COALESCE(w.senior_pct, (50) :: double precision) / (100.0) :: double precision
        )
      )
    )
  END AS final_score
FROM
  (
    (
      (
        (
          equipos t
          JOIN videojuegos v ON ((v.id_equipo = t.id_equipo))
        )
        LEFT JOIN (
          SELECT
            evaluacion.id_videojuego,
            avg(evaluacion.puntaje_total) AS avg_score
          FROM
            evaluacion
          WHERE
            (
              (evaluacion.activo = TRUE)
              AND (evaluacion.es_jurado_senior = false)
            )
          GROUP BY
            evaluacion.id_videojuego
        ) jr ON ((jr.id_videojuego = v.id_videojuego))
      )
      LEFT JOIN (
        SELECT
          evaluacion.id_videojuego,
          avg(evaluacion.puntaje_total) AS avg_score
        FROM
          evaluacion
        WHERE
          (
            (evaluacion.activo = TRUE)
            AND (evaluacion.es_jurado_senior = TRUE)
          )
        GROUP BY
          evaluacion.id_videojuego
      ) sr ON ((sr.id_videojuego = v.id_videojuego))
    )
    LEFT JOIN ponderado w ON (
      (
        w.id_edicion = COALESCE(
          t.id_edicion,
          (
            SELECT
              w.id
            FROM
              ediciones
            WHERE
              (ediciones.activo = TRUE)
            ORDER BY
              w.id DESC
            LIMIT
              1
          )
        )
      )
    )
  );