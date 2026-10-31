-- Inscripciones abiertas: las rutas públicas de registro (POST /teams, /upload, /upload/zip) solo
-- responden si este ajuste está en true (o si quien llama es Administrador). Por defecto, cerradas.
ALTER TABLE "configuracion_evento" ADD COLUMN IF NOT EXISTS "inscripciones_abiertas" BOOLEAN NOT NULL DEFAULT false;
