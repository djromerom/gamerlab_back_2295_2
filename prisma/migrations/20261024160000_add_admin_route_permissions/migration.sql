-- BG-01: exigir permisos de rol en rutas administrativas que solo pedían sesión.
--
-- Crea los servicios/permisos nuevos y los asigna a los roles que los necesitan.
-- Es IDEMPOTENTE y NO depende de ids: todo se resuelve por NOMBRE, porque los ids
-- de `permisos`/`servicio` difieren entre local, Arkad-test y producción.
--
-- IMPORTANTE (RolePermissionGuard): un servicio que existe pero NO tiene ningún
-- permiso asociado en `servicio_permiso` queda abierto a cualquier usuario con
-- sesión. Por eso el final de este script falla (y revierte todo) si algún servicio
-- nuevo quedó sin permiso.
--
-- Si la base está vacía (instalación nueva: aún no hay roles) no hace nada; en ese
-- caso `seed.ts` vuelve a ejecutar este mismo archivo después de cargar
-- `seed-data.json`.
--
-- Nota: el Administrador pasa siempre el guard (bypass por nombre de rol), pero se
-- le asignan los permisos igualmente por consistencia con el resto del catálogo.

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "rol" = 'Administrador') THEN
    RAISE NOTICE 'BG-01: la tabla roles esta vacia, se omite (el seed aplicara estos permisos).';
    RETURN;
  END IF;

  -- Las cargas iniciales insertaron ids explicitos: se resincronizan las secuencias
  -- para que los INSERT sin id no choquen con filas existentes.
  PERFORM setval(pg_get_serial_sequence('permisos', 'id_permiso'),
                 COALESCE((SELECT MAX("id_permiso") FROM "permisos"), 0) + 1, false);
  PERFORM setval(pg_get_serial_sequence('servicio', 'id_servicio'),
                 COALESCE((SELECT MAX("id_servicio") FROM "servicio"), 0) + 1, false);

  -- 1) Permisos
  INSERT INTO "permisos" ("nombre", "descripcion", "actualizado_en")
  SELECT v."nombre", v."descripcion", CURRENT_TIMESTAMP
  FROM (VALUES
    ('MANAGE_EDITIONS',            'Crear, editar, activar, archivar y eliminar ediciones y sus fotos'),
    ('MANAGE_EDUCATIONAL_FOCUSES', 'Crear, editar y eliminar los enfoques educativos de una edicion'),
    ('MANAGE_TESTIMONIALS',        'Crear, editar y eliminar los testimonios de una edicion'),
    ('MANAGE_HIGHLIGHTED_GAMES',   'Agregar y quitar juegos destacados de una edicion'),
    ('MANAGE_HISTORICALS',         'Consultar y modificar el historico de ediciones archivadas'),
    ('EXPORT_ADMIN_REPORTS',       'Descargar los reportes en Excel de calificaciones y de jurados'),
    ('UPDATE_VIDEOGAME',           'Modificar un videojuego (un estudiante solo el de su propio equipo)'),
    ('MANAGE_VIDEOGAMES',          'Crear y eliminar videojuegos'),
    ('MANAGE_UPLOADS',             'Consultar, publicar y eliminar archivos subidos'),
    ('MANAGE_AUTH_TOKENS',         'Reiniciar la expiracion de tokens de verificacion de cualquier usuario'),
    ('VIEW_TEAM_LEADER_STATUS',    'Consultar el estado de la cuenta del lider de un equipo por correo'),
    ('VIEW_TEAM_EVALUATION_STATS', 'Ver cuantos jurados han calificado un equipo (un estudiante solo el suyo)'),
    ('SEND_CERTIFICATES',          'Enviar certificados a jurados')
  ) AS v("nombre", "descripcion")
  ON CONFLICT ("nombre") DO NOTHING;

  -- 2) Servicios (los que usa @RequiredService en el backend)
  INSERT INTO "servicio" ("nombre", "descripcion", "actualizado_en")
  SELECT v."nombre", v."descripcion", CURRENT_TIMESTAMP
  FROM (VALUES
    ('ManageEditions',            'Escritura sobre ediciones (crear, editar, fotos, activar, archivar, eliminar)'),
    ('ManageEducationalFocuses',  'Escritura sobre enfoques educativos de una edicion'),
    ('ManageTestimonials',        'Escritura sobre testimonios de una edicion'),
    ('ManageHighlightedGames',    'Escritura sobre juegos destacados de una edicion'),
    ('ManageHistoricals',         'Lectura administrativa y escritura del historico de ediciones'),
    ('ExportAdminReports',        'Reportes en Excel de calificaciones y jurados'),
    ('UpdateVideogame',           'Actualizar un videojuego (con verificacion de propiedad)'),
    ('ManageVideogames',          'Crear y eliminar videojuegos'),
    ('ManageUploads',             'Consultar, publicar y eliminar archivos subidos'),
    ('ManageAuthTokens',          'Reiniciar expiracion de tokens de usuarios'),
    ('ViewTeamLeaderStatus',      'Estado de la cuenta del lider de un equipo'),
    ('ViewTeamEvaluationStats',   'Estadisticas de evaluacion de un equipo (con verificacion de propiedad)'),
    ('certificates',              'Envio de certificados a jurados')
  ) AS v("nombre", "descripcion")
  ON CONFLICT ("nombre") DO NOTHING;

  -- 3) Servicio -> permiso
  INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso")
  SELECT s."id_servicio", p."id_permiso"
  FROM (VALUES
    ('ManageEditions',            'MANAGE_EDITIONS'),
    ('ManageEducationalFocuses',  'MANAGE_EDUCATIONAL_FOCUSES'),
    ('ManageTestimonials',        'MANAGE_TESTIMONIALS'),
    ('ManageHighlightedGames',    'MANAGE_HIGHLIGHTED_GAMES'),
    ('ManageHistoricals',         'MANAGE_HISTORICALS'),
    ('ExportAdminReports',        'EXPORT_ADMIN_REPORTS'),
    ('UpdateVideogame',           'UPDATE_VIDEOGAME'),
    ('ManageVideogames',          'MANAGE_VIDEOGAMES'),
    ('ManageUploads',             'MANAGE_UPLOADS'),
    ('ManageAuthTokens',          'MANAGE_AUTH_TOKENS'),
    ('ViewTeamLeaderStatus',      'VIEW_TEAM_LEADER_STATUS'),
    ('ViewTeamEvaluationStats',   'VIEW_TEAM_EVALUATION_STATS'),
    ('certificates',              'SEND_CERTIFICATES')
  ) AS v("servicio", "permiso")
  JOIN "servicio" s ON s."nombre" = v."servicio"
  JOIN "permisos" p ON p."nombre" = v."permiso"
  ON CONFLICT ("id_servicio", "id_permiso") DO NOTHING;

  -- 4) Rol -> permiso
  INSERT INTO "rol_permiso" ("id_rol", "id_permiso")
  SELECT r."id_rol", p."id_permiso"
  FROM (VALUES
    ('Administrador', 'MANAGE_EDITIONS'),
    ('Administrador', 'MANAGE_EDUCATIONAL_FOCUSES'),
    ('Administrador', 'MANAGE_TESTIMONIALS'),
    ('Administrador', 'MANAGE_HIGHLIGHTED_GAMES'),
    ('Administrador', 'MANAGE_HISTORICALS'),
    ('Administrador', 'EXPORT_ADMIN_REPORTS'),
    ('Administrador', 'UPDATE_VIDEOGAME'),
    ('Administrador', 'MANAGE_VIDEOGAMES'),
    ('Administrador', 'MANAGE_UPLOADS'),
    ('Administrador', 'MANAGE_AUTH_TOKENS'),
    ('Administrador', 'VIEW_TEAM_LEADER_STATUS'),
    ('Administrador', 'VIEW_TEAM_EVALUATION_STATS'),
    ('Administrador', 'SEND_CERTIFICATES'),
    ('Estudiante',    'UPDATE_VIDEOGAME'),
    ('Estudiante',    'VIEW_TEAM_EVALUATION_STATS'),
    ('Profesor',      'VIEW_TEAM_EVALUATION_STATS'),
    ('Jurado',        'VIEW_TEAM_EVALUATION_STATS')
  ) AS v("rol", "permiso")
  JOIN "roles" r ON r."rol" = v."rol"
  JOIN "permisos" p ON p."nombre" = v."permiso"
  ON CONFLICT ("id_rol", "id_permiso") DO NOTHING;

  -- 5) Salvaguarda: ningun servicio nuevo puede quedar sin permiso asociado.
  IF EXISTS (
    SELECT 1
    FROM "servicio" s
    WHERE s."nombre" IN (
      'ManageEditions', 'ManageEducationalFocuses', 'ManageTestimonials',
      'ManageHighlightedGames', 'ManageHistoricals', 'ExportAdminReports',
      'UpdateVideogame', 'ManageVideogames', 'ManageUploads', 'ManageAuthTokens',
      'ViewTeamLeaderStatus', 'ViewTeamEvaluationStats', 'certificates'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "servicio_permiso" sp WHERE sp."id_servicio" = s."id_servicio"
    )
  ) THEN
    RAISE EXCEPTION 'BG-01: un servicio nuevo quedo sin permiso asociado; quedaria abierto a cualquier usuario con sesion.';
  END IF;
END
$migration$;
