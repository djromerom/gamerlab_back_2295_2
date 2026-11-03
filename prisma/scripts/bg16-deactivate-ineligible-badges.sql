-- BG-16 (ARK-127): desactiva (activo = false) las escarapelas de la edición activa cuyo dueño
-- NO es jurado de esa edición. Regla = `jurorsOfEdition` (src/juror-edition/jurors-of-edition.ts):
--   cuenta activa Y ( rol Jurado CONFIRMADO en jurado_edicion para la edición
--                     O rol Profesor con al menos un NRC activo en la edición ).
-- Los profesores con NRC activo en la edición conservan su escarapela.
--
-- NO es una migración: el resultado depende de quién esté confirmado en el momento.
-- Orden en producción (Allison, 2026-11-02):
--   HU-25 en producción → Allison carga los NRC y confirma a los jurados que vienen →
--   BG-16 en producción → se ejecuta este script → Allison genera las escarapelas (25-nov).
--
-- Uso (psql 10 o superior). Primero SIEMPRE la vista previa (no cambia nada, termina en ROLLBACK):
--   psql -v ON_ERROR_STOP=1 -v edicion=5 -f bg16-deactivate-ineligible-badges.sql
-- Si los conteos coinciden con lo esperado, aplicar:
--   psql -v ON_ERROR_STOP=1 -v edicion=5 -v aplicar=1 -f bg16-deactivate-ineligible-badges.sql
--
-- Antes de aplicar (lo hace DevOps):
--   pg_dump -t escarapelas_jurado -t asistencia_jurado ...
--
-- Seguridad:
--   * Aborta si :edicion no es la edición activa.
--   * Aborta si hay llegadas activas (asistencia_jurado) en la edición: alguien probó el
--     check-in; avisar a Allison antes de seguir.
--   * Nunca borra: asistencia_jurado referencia a escarapelas_jurado por id_escarapela.
--   * Idempotente: una segunda ejecución no cambia nada.
--   * Reversible: las filas afectadas quedan en "bg16_respaldo_escarapelas" (ver el final).

\if :{?edicion}
\else
  \echo 'Falta -v edicion=<id de la edición activa>'
  \quit
\endif
\if :{?aplicar}
\else
  \set aplicar 0
\endif

BEGIN;

\o /dev/null
SELECT set_config('bg16.edicion', :'edicion', true);
\o

DO $$
DECLARE
  esperada int := current_setting('bg16.edicion')::int;
  activa int;
  llegadas int;
BEGIN
  SELECT id_edicion INTO activa
  FROM "ediciones" WHERE "estado" = 'ACTIVE'
  ORDER BY id_edicion DESC LIMIT 1;
  IF activa IS DISTINCT FROM esperada THEN
    RAISE EXCEPTION 'La edición activa es % y se pasó edicion=%: no se cambia nada', activa, esperada;
  END IF;

  SELECT count(*) INTO llegadas
  FROM "asistencia_jurado" WHERE id_edicion = esperada AND activo;
  IF llegadas > 0 THEN
    RAISE EXCEPTION 'Hay % llegadas activas en la edición %: avisar a Allison antes de seguir', llegadas, esperada;
  END IF;
END $$;

-- Usuarios que SÍ son jurados de la edición (misma regla que jurorsOfEdition).
CREATE TEMP TABLE bg16_elegibles ON COMMIT DROP AS
SELECT u.id_usuario
FROM "usuarios" u
JOIN "roles" r ON r.id_rol = u.id_rol
WHERE u.activo = true
  AND (
    (r.rol = 'Jurado' AND EXISTS (
      SELECT 1 FROM "jurado_edicion" je
      WHERE je.id_usuario = u.id_usuario
        AND je.id_edicion = :edicion
        AND je.estado = 'CONFIRMED'))
    OR
    (r.rol = 'Profesor' AND EXISTS (
      SELECT 1 FROM "nrc" n
      WHERE n.id_profesor = u.id_usuario
        AND n.id_edicion = :edicion
        AND n.activo = true))
  );

CREATE TEMP TABLE bg16_no_elegibles ON COMMIT DROP AS
SELECT esc.id_escarapela
FROM "escarapelas_jurado" esc
WHERE esc.id_edicion = :edicion
  AND esc.activo = true
  AND esc.id_usuario NOT IN (SELECT id_usuario FROM bg16_elegibles);

\echo '== Antes'
SELECT
  :edicion AS edicion,
  count(*) FILTER (WHERE esc.activo) AS escarapelas_activas,
  count(*) FILTER (WHERE esc.activo AND r.rol = 'Profesor'
                   AND esc.id_usuario IN (SELECT id_usuario FROM bg16_elegibles))
    AS profesores_con_nrc_se_quedan,
  count(*) FILTER (WHERE esc.activo AND r.rol = 'Jurado'
                   AND esc.id_usuario IN (SELECT id_usuario FROM bg16_elegibles))
    AS jurados_confirmados_se_quedan,
  (SELECT count(*) FROM bg16_no_elegibles) AS a_desactivar
FROM "escarapelas_jurado" esc
JOIN "usuarios" u ON u.id_usuario = esc.id_usuario
JOIN "roles" r ON r.id_rol = u.id_rol
WHERE esc.id_edicion = :edicion;

-- Respaldo: copia exacta de las filas antes de cambiarlas (los ids sirven para revertir).
CREATE TABLE IF NOT EXISTS "bg16_respaldo_escarapelas" (
  LIKE "escarapelas_jurado",
  respaldado_en timestamp(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (id_escarapela)
);

INSERT INTO "bg16_respaldo_escarapelas"
SELECT esc.*, now()
FROM "escarapelas_jurado" esc
WHERE esc.id_escarapela IN (SELECT id_escarapela FROM bg16_no_elegibles)
ON CONFLICT (id_escarapela) DO NOTHING;

-- Borrado lógico
UPDATE "escarapelas_jurado"
SET activo = false
WHERE id_escarapela IN (SELECT id_escarapela FROM bg16_no_elegibles);

\echo '== Después'
SELECT
  count(*) FILTER (WHERE esc.activo) AS escarapelas_activas,
  count(*) FILTER (WHERE esc.activo AND r.rol = 'Profesor') AS profesores_activos,
  count(*) FILTER (WHERE esc.activo AND r.rol = 'Jurado') AS jurados_activos,
  (SELECT count(*) FROM "bg16_respaldo_escarapelas" b WHERE b.id_edicion = :edicion)
    AS filas_en_respaldo
FROM "escarapelas_jurado" esc
JOIN "usuarios" u ON u.id_usuario = esc.id_usuario
JOIN "roles" r ON r.id_rol = u.id_rol
WHERE esc.id_edicion = :edicion;

\if :aplicar
  COMMIT;
  \echo '== Aplicado (COMMIT)'
\else
  ROLLBACK;
  \echo '== Vista previa: no se cambió nada (ROLLBACK). Para aplicar: -v aplicar=1'
\endif

-- Para revertir (solo si hace falta), reactivar desde el respaldo:
--   UPDATE "escarapelas_jurado" esc SET activo = true
--   FROM "bg16_respaldo_escarapelas" b
--   WHERE b.id_escarapela = esc.id_escarapela AND b.activo = true;
-- Si al jurado ya se le generó otra escarapela activa en la edición, el índice único parcial
-- (jurado, edición) lo impedirá: en ese caso no hace falta revertir esa fila.
