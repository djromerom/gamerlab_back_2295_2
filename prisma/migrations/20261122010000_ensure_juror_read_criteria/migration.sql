-- HU-53 (ARK-324): jurados y profesores consultan las rúbricas (criterios de calificación) en solo lectura.
-- El seed ya les da a los roles Jurado y Profesor los permisos READ_CRITERIA (servicio ListCriterion) y
-- READ_CRITERION_DETAIL (servicio GetCriterion). Esta migración solo los asegura en bases donde
-- falten. Es idempotente, no crea permisos ni servicios y no da permisos de escritura:
-- CreateCriterion, UpdateCriterion, DeleteCriterion y RestoreCriterion siguen solo para el Administrador.

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'HU-53: la tabla roles esta vacia, se omite (el seed carga los permisos).';
    RETURN;
  END IF;

  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM "roles" r
  JOIN "permisos" p ON p."nombre" IN ('READ_CRITERIA', 'READ_CRITERION_DETAIL')
  WHERE r."rol" IN ('Jurado', 'Profesor')
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM "roles" r
    WHERE r."rol" IN ('Jurado', 'Profesor')
      AND (
        SELECT COUNT(DISTINCT s."nombre")
        FROM "rol_permiso" rp
        JOIN "servicio_permiso" sp ON sp."id_permiso" = rp."id_permiso"
        JOIN "servicio" s ON s."id_servicio" = sp."id_servicio"
        WHERE rp."id_rol" = r."id_rol"
          AND s."nombre" IN ('ListCriterion', 'GetCriterion')
      ) < 2
  ) THEN
    RAISE NOTICE 'HU-53: Jurado o Profesor no quedo con ListCriterion y GetCriterion; revisar servicio_permiso.';
  END IF;
END
$migration$;
