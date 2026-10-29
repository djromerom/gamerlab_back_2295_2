-- CreateTable
CREATE TABLE "escarapelas_jurado" (
    "id_escarapela" SERIAL NOT NULL,
    "id_usuario" TEXT NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escarapelas_jurado_pkey" PRIMARY KEY ("id_escarapela")
);

-- CreateIndex
CREATE UNIQUE INDEX "escarapelas_jurado_token_key" ON "escarapelas_jurado"("token");

-- CreateIndex
CREATE INDEX "escarapelas_jurado_id_edicion_idx" ON "escarapelas_jurado"("id_edicion");

-- Un jurado tiene a lo sumo una escarapela activa por edición (índice parcial: no lo expresa Prisma).
CREATE UNIQUE INDEX "escarapelas_jurado_activa_unica"
    ON "escarapelas_jurado"("id_usuario", "id_edicion")
    WHERE "activo" = true;

-- AddForeignKey
ALTER TABLE "escarapelas_jurado" ADD CONSTRAINT "escarapelas_jurado_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escarapelas_jurado" ADD CONSTRAINT "escarapelas_jurado_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permiso y servicio de administración de escarapelas.
-- Se crean aquí porque seed.ts no se ejecuta en producción. En una base nueva (sin permisos)
-- se omite: los inserta prisma/seed-data.json. El permiso no se asigna a ningún rol, así que
-- solo el Administrador (que pasa todas las verificaciones) puede usar el servicio.
INSERT INTO "permisos" ("id_permiso", "nombre", "descripcion", "creado_en", "actualizado_en", "activo")
SELECT (SELECT COALESCE(MAX("id_permiso"), 0) + 1 FROM "permisos"),
       'MANAGE_JUROR_BADGES',
       'Permite generar y consultar las escarapelas con QR de los jurados (solo Administrador)',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
WHERE EXISTS (SELECT 1 FROM "permisos")
  AND NOT EXISTS (SELECT 1 FROM "permisos" WHERE "nombre" = 'MANAGE_JUROR_BADGES');

INSERT INTO "servicio" ("id_servicio", "nombre", "descripcion", "creado_en", "actualizado_en", "activo")
SELECT (SELECT COALESCE(MAX("id_servicio"), 0) + 1 FROM "servicio"),
       'ManageJurorBadges',
       'Generar y consultar escarapelas con QR de jurados',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
WHERE EXISTS (SELECT 1 FROM "permisos" WHERE "nombre" = 'MANAGE_JUROR_BADGES')
  AND NOT EXISTS (SELECT 1 FROM "servicio" WHERE "nombre" = 'ManageJurorBadges');

INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso", "creado_en", "actualizado_en", "activo")
SELECT s."id_servicio", p."id_permiso", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
FROM "servicio" s, "permisos" p
WHERE s."nombre" = 'ManageJurorBadges'
  AND p."nombre" = 'MANAGE_JUROR_BADGES'
  AND NOT EXISTS (
    SELECT 1 FROM "servicio_permiso" sp
    WHERE sp."id_servicio" = s."id_servicio" AND sp."id_permiso" = p."id_permiso"
  );
