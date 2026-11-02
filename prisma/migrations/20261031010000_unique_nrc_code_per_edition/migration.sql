-- Un mismo código de NRC no puede estar activo dos veces en la misma edición.
-- Índice parcial: Prisma no lo expresa en schema.prisma, por eso va en SQL crudo.
CREATE UNIQUE INDEX IF NOT EXISTS "nrc_codigo_id_edicion_activo_key"
  ON "nrc" ("codigo", "id_edicion")
  WHERE "activo" = true;
