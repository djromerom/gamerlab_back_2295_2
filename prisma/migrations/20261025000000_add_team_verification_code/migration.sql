-- CreateEnum
CREATE TYPE "TeamVerificationAction" AS ENUM ('ATTEMPT_SUCCESS', 'ATTEMPT_FAILED', 'CODE_VIEWED', 'CODE_REGENERATED');

-- AlterTable
ALTER TABLE "equipos" ADD COLUMN     "codigo_verificacion" VARCHAR(8);

-- CreateTable
CREATE TABLE "verificacion_equipo" (
    "id_verificacion" SERIAL NOT NULL,
    "id_equipo" INTEGER NOT NULL,
    "id_jurado" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verificacion_equipo_pkey" PRIMARY KEY ("id_verificacion")
);

-- CreateTable
CREATE TABLE "team_verification_logs" (
    "id" SERIAL NOT NULL,
    "action" "TeamVerificationAction" NOT NULL,
    "team_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verificacion_equipo_id_equipo_id_jurado_key" ON "verificacion_equipo"("id_equipo", "id_jurado");

-- CreateIndex
CREATE INDEX "team_verification_logs_team_id_user_id_action_created_at_idx" ON "team_verification_logs"("team_id", "user_id", "action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "equipos_codigo_verificacion_id_edicion_key" ON "equipos"("codigo_verificacion", "id_edicion");

-- AddForeignKey
ALTER TABLE "verificacion_equipo" ADD CONSTRAINT "verificacion_equipo_id_equipo_fkey" FOREIGN KEY ("id_equipo") REFERENCES "equipos"("id_equipo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacion_equipo" ADD CONSTRAINT "verificacion_equipo_id_jurado_fkey" FOREIGN KEY ("id_jurado") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Códigos de verificación para los equipos universitarios (N1 a N4) de la edición activa que aún no
-- tienen uno. Los equipos de colegios (N0) no llevan código. Alfabeto sin caracteres ambiguos (sin 0, O, 1, I).
DO $$
DECLARE
    t RECORD;
    candidate TEXT;
    alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
    FOR t IN
        SELECT eq."id_equipo", eq."id_edicion"
        FROM "equipos" eq
        JOIN "ediciones" ed ON ed."id_edicion" = eq."id_edicion"
        WHERE ed."estado"::text = 'ACTIVE'
          AND eq."codigo_verificacion" IS NULL
          AND eq."codigo_equipo" NOT LIKE 'N0-%'
    LOOP
        LOOP
            candidate := '';
            FOR i IN 1..6 LOOP
                candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
            END LOOP;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM "equipos"
                WHERE "codigo_verificacion" = candidate AND "id_edicion" = t."id_edicion"
            );
        END LOOP;
        UPDATE "equipos" SET "codigo_verificacion" = candidate WHERE "id_equipo" = t."id_equipo";
    END LOOP;
END $$;

-- Permiso y servicio de administración del código. Se crean aquí porque seed.ts no se ejecuta en
-- producción. En una base nueva (sin permisos) se omite: los inserta prisma/seed-data.json. El permiso
-- no se asigna a ningún rol, así que solo el Administrador (que pasa todas las verificaciones) lo usa.
INSERT INTO "permisos" ("id_permiso", "nombre", "descripcion", "creado_en", "actualizado_en", "activo")
SELECT (SELECT COALESCE(MAX("id_permiso"), 0) + 1 FROM "permisos"),
       'MANAGE_TEAM_VERIFICATION_CODE',
       'Permite consultar y regenerar el código de verificación de un equipo (solo Administrador)',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
WHERE EXISTS (SELECT 1 FROM "permisos")
  AND NOT EXISTS (SELECT 1 FROM "permisos" WHERE "nombre" = 'MANAGE_TEAM_VERIFICATION_CODE');

INSERT INTO "servicio" ("id_servicio", "nombre", "descripcion", "creado_en", "actualizado_en", "activo")
SELECT (SELECT COALESCE(MAX("id_servicio"), 0) + 1 FROM "servicio"),
       'ManageTeamVerificationCode',
       'Consultar y regenerar el código de verificación de un equipo',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
WHERE EXISTS (SELECT 1 FROM "permisos" WHERE "nombre" = 'MANAGE_TEAM_VERIFICATION_CODE')
  AND NOT EXISTS (SELECT 1 FROM "servicio" WHERE "nombre" = 'ManageTeamVerificationCode');

INSERT INTO "servicio_permiso" ("id_servicio", "id_permiso", "creado_en", "actualizado_en", "activo")
SELECT s."id_servicio", p."id_permiso", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
FROM "servicio" s, "permisos" p
WHERE s."nombre" = 'ManageTeamVerificationCode'
  AND p."nombre" = 'MANAGE_TEAM_VERIFICATION_CODE'
  AND NOT EXISTS (
    SELECT 1 FROM "servicio_permiso" sp
    WHERE sp."id_servicio" = s."id_servicio" AND sp."id_permiso" = p."id_permiso"
  );
