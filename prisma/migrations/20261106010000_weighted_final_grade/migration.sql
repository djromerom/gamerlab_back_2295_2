-- HU-34 (ARK-196): nota final = 60 % promedio de los profesores que calificaron al grupo
-- + 40 % promedio de los jurados junior (P-02, confirmada por Allison el 6-nov).
-- Sigue siendo un solo cálculo: vw_team_final_scores. Solo cambian sus reglas.
--
-- Qué hace (en este orden):
-- 1) Congela las ediciones que ya no se pueden modificar: ARCHIVED, o INACTIVE que ya terminó
--    (misma regla de HU-25). Conservan su ponderado, 50/50 si no tenían y la nota parcial. Sus
--    notas no cambian y su fila de ponderado no se toca.
-- 2) Las demás (ACTIVE e INACTIVE aún sin terminar) quedan en 60/40: se crea su fila en ponderado
--    y se SOBRESCRIBE la que tuvieran. Decisión de P-02; el administrador puede cambiarla después
--    en la edición activa (PUT /settings/weights).
-- 3) Vista, en este orden de prioridad para las ediciones vigentes:
--    - Colegios N0 (código N0-..., con o sin marca de externo): 100 % el promedio de los profesores y
--      seniors que los calificaron; nunca esperan nota de jurados junior (Allison, 7-nov; P-08).
--    - Externos: solo la nota junior (regla vigente, HU-38).
--    - Los demás: si falta una de las dos partes, NULL («Nota en proceso», regla de HU-20).
-- 4) El Profesor puede leer la ponderación vigente (READ_WEIGHT), para el texto de sus pantallas.
--
-- No toca evaluacion ni resultado_ranking. Cambian las notas de las ediciones del punto 2.
-- Una edición nueva nace sin congelar y con 60/40.

-- 1) Edición congelada: regla anterior a HU-34.
ALTER TABLE "ediciones" ADD COLUMN "regla_nota_heredada" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ediciones"
SET "regla_nota_heredada" = true
WHERE "estado" = 'ARCHIVED'
   OR ("estado" = 'INACTIVE' AND "termina_en" <= CURRENT_TIMESTAMP);

-- 2) Parámetros 60/40 de las ediciones vigentes.
INSERT INTO "ponderado" ("id_edicion", "senior_pct", "junior_pct", "actualizado_en")
SELECT e."id_edicion", 60, 40, CURRENT_TIMESTAMP
FROM "ediciones" e
WHERE e."regla_nota_heredada" = false
ON CONFLICT ("id_edicion") DO UPDATE
SET "senior_pct" = 60, "junior_pct" = 40, "actualizado_en" = CURRENT_TIMESTAMP
WHERE "ponderado"."senior_pct" <> 60 OR "ponderado"."junior_pct" <> 40;

-- 3) Nota final.
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
            WHEN t.externo = true THEN jr.avg_score
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
JOIN ediciones ed ON ed.id_edicion = t.id_edicion
LEFT JOIN jr ON jr.id_videojuego = v.id_videojuego
LEFT JOIN sr ON sr.id_videojuego = v.id_videojuego
LEFT JOIN ponderado w ON w.id_edicion = t.id_edicion
CROSS JOIN LATERAL (
    SELECT
        COALESCE(w.junior_pct, CASE WHEN ed.regla_nota_heredada THEN 50 ELSE 40 END::double precision) AS junior_pct,
        COALESCE(w.senior_pct, CASE WHEN ed.regla_nota_heredada THEN 50 ELSE 60 END::double precision) AS senior_pct
) pct;

-- 4) Lectura de la ponderación para el Profesor. Por nombre e idempotente; en una base nueva (sin
--    roles) no hace nada: lo carga prisma/seed-data.json.
INSERT INTO "rol_permiso" ("id_rol", "id_permiso", "actualizado_en")
SELECT r."id_rol", p."id_permiso", CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permisos" p ON p."nombre" = 'READ_WEIGHT'
WHERE r."rol" = 'Profesor'
ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;
