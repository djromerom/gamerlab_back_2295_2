-- Servicio RBAC GetWeight (SettingsController.getLatest / getByEdition, GET /settings/weights).
-- Existe en prisma/seed-data.json pero no en las bases de test/producción (el seed no corre
-- allí), así que la ruta respondía 404 "Required service configuration 'GetWeight'".
--
-- Replica lo que define el seed: servicio GetWeight -> permiso READ_WEIGHT. El seed no
-- concede READ_WEIGHT a ningún rol, así que solo el Administrador (bypass del guard) accede,
-- igual que con el resto de servicios sin rol asignado. Los ids se resuelven por NOMBRE.
-- Es idempotente: si el permiso ya existe (con ese nombre) se reutiliza, sin duplicar.
-- En una base nueva (sin permisos) se omite, igual que add_juror_badges.
INSERT INTO "permisos" ("id_permiso", "nombre", "descripcion", "creado_en", "actualizado_en", "activo")
SELECT (SELECT COALESCE(MAX("id_permiso"), 0) + 1 FROM "permisos"),
       'READ_WEIGHT',
       'Permite leer la configuración de ponderado por edición',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
WHERE EXISTS (SELECT 1 FROM "permisos")
  AND NOT EXISTS (SELECT 1 FROM "permisos" WHERE "nombre" = 'READ_WEIGHT');

INSERT INTO "servicio" ("id_servicio", "nombre", "descripcion", "metodo", "creado_en", "actualizado_en", "activo")
SELECT (SELECT COALESCE(MAX("id_servicio"), 0) + 1 FROM "servicio"),
       'GetWeight',
       'Obtener configuración de ponderado por edición (SettingsController.getWeight)',
       'GET',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
WHERE EXISTS (SELECT 1 FROM "permisos" WHERE "nombre" = 'READ_WEIGHT')
  AND NOT EXISTS (SELECT 1 FROM "servicio" WHERE "nombre" = 'GetWeight');

INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso", "creado_en", "actualizado_en", "activo")
SELECT s."id_servicio", p."id_permiso", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
FROM "servicio" s, "permisos" p
WHERE s."nombre" = 'GetWeight'
  AND p."nombre" = 'READ_WEIGHT'
  AND NOT EXISTS (
    SELECT 1 FROM "servicio_permiso" sp
    WHERE sp."id_servicio" = s."id_servicio" AND sp."id_permiso" = p."id_permiso"
  );
