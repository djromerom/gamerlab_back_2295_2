-- ARK-139: todo profesor es jurado Senior y, si no tiene tipo, Oficial.
-- Solo toca profesores con categoría o tipo vacíos; no cambia valores ya elegidos.
-- Respaldo y recuentos antes y después: docs/ARK-139-profesores-senior-oficial.md

UPDATE "usuarios" u
SET "categoria_jurado" = 'SENIOR', "actualizado_en" = NOW()
FROM "roles" r
WHERE u."id_rol" = r."id_rol"
  AND r."rol" = 'Profesor'
  AND u."categoria_jurado" IS NULL;

UPDATE "usuarios" u
SET "tipo_jurado" = 'OFFICIAL', "actualizado_en" = NOW()
FROM "roles" r
WHERE u."id_rol" = r."id_rol"
  AND r."rol" = 'Profesor'
  AND u."tipo_jurado" IS NULL;
