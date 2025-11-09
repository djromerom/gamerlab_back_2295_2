-- Ajustar secuencia de servicio para evitar duplicados si está desalineada
SELECT setval(pg_get_serial_sequence('servicio','id_servicio'), (SELECT COALESCE(MAX(id_servicio),0) FROM servicio));

-- 1) Añadir permiso 31 al rol Profesor (id_rol = 3) si no existe
INSERT INTO rol_permiso (id_rol, id_permiso, creado_en, actualizado_en, activo)
SELECT 3, 31, now(), now(), true
WHERE NOT EXISTS (
  SELECT 1 FROM rol_permiso WHERE id_rol = 3 AND id_permiso = 31
);

-- 2) Crear el servicio UploadSeniorGrades si no existe (registro en 'servicio')
INSERT INTO servicio (nombre, descripcion, creado_en, actualizado_en, activo)
SELECT 'UploadSeniorGrades', 'Permite subir calificaciones de jurado senior', now(), now(), true
WHERE NOT EXISTS (
  SELECT 1 FROM servicio WHERE nombre = 'UploadSeniorGrades'
);

-- 3) Asociar el permiso 31 al servicio UploadSeniorGrades si no existe la asociación
INSERT INTO servicio_permiso (id_servicio, id_permiso, creado_en, actualizado_en, activo)
SELECT s.id_servicio, 31, now(), now(), true
FROM servicio s
WHERE s.nombre = 'UploadSeniorGrades'
  AND NOT EXISTS (
    SELECT 1 FROM servicio_permiso sp
    WHERE sp.id_servicio = s.id_servicio AND sp.id_permiso = 31
  );