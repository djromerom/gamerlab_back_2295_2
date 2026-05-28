-- CreateEnum
CREATE TYPE "EditionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- AlterTable: add new column
ALTER TABLE "ediciones" ADD COLUMN "estado" "EditionStatus" NOT NULL DEFAULT 'INACTIVE';

-- Migrate existing data: active editions → ACTIVE, others → INACTIVE
UPDATE "ediciones" SET "estado" = 'ACTIVE' WHERE "activo" = true;
UPDATE "ediciones" SET "estado" = 'INACTIVE' WHERE "activo" = false;

-- Editions that already have a historical dump get ARCHIVED status
UPDATE "ediciones"
SET "estado" = 'ARCHIVED'
WHERE "activo" = false
  AND EXISTS (
    SELECT 1 FROM "equipos_historico"
    WHERE "equipos_historico"."id_edicion" = "ediciones"."id_edicion"
  );

-- Drop the view that depends on ediciones.activo before dropping the column
DROP VIEW IF EXISTS public.vw_team_final_scores;

-- Drop old column
ALTER TABLE "ediciones" DROP COLUMN "activo";

-- Recreate the view replacing ediciones.activo with ediciones.estado = 'ACTIVE'
CREATE OR REPLACE VIEW vw_team_final_scores AS
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
        WHEN t.externo = true THEN COALESCE(jr.avg_score, 0::double precision)
        ELSE (
            COALESCE(jr.avg_score, 0::double precision) * (
                COALESCE(w.junior_pct, 50::double precision) / 100.0::double precision
            ) + COALESCE(sr.avg_score, 0::double precision) * (
                COALESCE(w.senior_pct, 50::double precision) / 100.0::double precision
            )
        )
    END AS final_score,
    t.nombre_equipo AS team_name,
    v.logo_url AS videogame_logo_url
FROM
    equipos t
    JOIN videojuegos v ON v.id_equipo = t.id_equipo
    LEFT JOIN (
        SELECT evaluacion.id_videojuego, AVG(evaluacion.puntaje_total) AS avg_score
        FROM evaluacion
        WHERE
            evaluacion.activo = true
            AND evaluacion.es_jurado_senior = false
        GROUP BY
            evaluacion.id_videojuego
    ) jr ON jr.id_videojuego = v.id_videojuego
    LEFT JOIN (
        SELECT evaluacion.id_videojuego, AVG(evaluacion.puntaje_total) AS avg_score
        FROM evaluacion
        WHERE
            evaluacion.activo = true
            AND evaluacion.es_jurado_senior = true
        GROUP BY
            evaluacion.id_videojuego
    ) sr ON sr.id_videojuego = v.id_videojuego
    LEFT JOIN ponderado w ON w.id_edicion = COALESCE(
        t.id_edicion,
        (
            SELECT id_edicion
            FROM ediciones
            WHERE
                estado = 'ACTIVE'
            ORDER BY id_edicion DESC
            LIMIT 1
        )
    );
