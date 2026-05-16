-- Change data type of equipos.codigo_equipo from varchar(10) to varchar(12).
-- Dropping the view is required as it refuses the ALTER column due to its dependency on codigo_equipo
--
-- The following transaction:
-- 1. drops the view
-- 2. alters the column
-- 3. re-creates the view

BEGIN;

DROP VIEW IF EXISTS vw_team_final_scores;

ALTER TABLE "equipos" ALTER COLUMN "codigo_equipo" SET DATA TYPE VARCHAR(12);

CREATE VIEW vw_team_final_scores AS
SELECT t.id_equipo AS team_id,
       t.codigo_equipo AS team_code,
       t.externo AS is_external,
       v.id_videojuego AS videogame_id,
       v.nombre AS videogame_name,
       t.id_edicion AS edition_id,
       jr.avg_score AS avg_junior,
       sr.avg_score AS avg_senior,
       CASE
           WHEN t.externo = true THEN COALESCE(jr.avg_score, 0::double precision)
           ELSE COALESCE(jr.avg_score, 0::double precision)
                * (COALESCE(w.junior_pct, 50::double precision) / 100.0::double precision)
              + COALESCE(sr.avg_score, 0::double precision)
                * (COALESCE(w.senior_pct, 50::double precision) / 100.0::double precision)
       END AS final_score
FROM equipos t
JOIN videojuegos v
  ON v.id_equipo = t.id_equipo
LEFT JOIN (
    SELECT evaluacion.id_videojuego,
           avg(evaluacion.puntaje_total) AS avg_score
    FROM evaluacion
    WHERE evaluacion.activo = true
      AND evaluacion.es_jurado_senior = false
    GROUP BY evaluacion.id_videojuego
) jr
  ON jr.id_videojuego = v.id_videojuego
LEFT JOIN (
    SELECT evaluacion.id_videojuego,
           avg(evaluacion.puntaje_total) AS avg_score
    FROM evaluacion
    WHERE evaluacion.activo = true
      AND evaluacion.es_jurado_senior = true
    GROUP BY evaluacion.id_videojuego
) sr
  ON sr.id_videojuego = v.id_videojuego
LEFT JOIN ponderado w
  ON w.id_edicion = COALESCE(
      t.id_edicion,
      (
          SELECT ediciones.id_edicion
          FROM ediciones
          WHERE ediciones.activo = true
          ORDER BY ediciones.id_edicion DESC
          LIMIT 1
      )
  );

COMMIT;
