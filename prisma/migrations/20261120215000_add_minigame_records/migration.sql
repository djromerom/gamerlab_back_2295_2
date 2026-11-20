-- HU-52 (ARK-315): récords globales de los minijuegos de la landing (Arkadash y Arkad Jam).
-- Solo se guardan los 5 mejores de cada pista; el back borra el resto al entrar uno nuevo.
-- No guarda datos de quien juega: solo el alias. Tabla nueva, sin datos que migrar.

-- CreateEnum
CREATE TYPE "MinigameGame" AS ENUM ('ARKADASH', 'ARKAD_JAM');

-- CreateTable
CREATE TABLE "record_minijuego" (
    "id_record" SERIAL NOT NULL,
    "juego" "MinigameGame" NOT NULL,
    "pista" VARCHAR(20) NOT NULL,
    "alias" VARCHAR(12) NOT NULL,
    "puntaje" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_minijuego_pkey" PRIMARY KEY ("id_record"),
    -- Respaldo del tope del back (SCORE_CAP en minigame-record-rules.ts); solo en la migración.
    CONSTRAINT "record_minijuego_puntaje_check" CHECK ("puntaje" > 0 AND "puntaje" <= 100000)
);

-- CreateIndex
CREATE INDEX "record_minijuego_juego_pista_puntaje_creado_en_idx" ON "record_minijuego"("juego", "pista", "puntaje" DESC, "creado_en");
