-- CreateTable
CREATE TABLE "resultado_ranking" (
    "id" SERIAL NOT NULL,
    "id_equipo" INTEGER NOT NULL,
    "id_videojuego" INTEGER NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "puntaje_base" DOUBLE PRECISION NOT NULL,
    "puntaje_ranking" DOUBLE PRECISION NOT NULL,
    "puntaje_desempate" DOUBLE PRECISION,
    "puntaje_desempate_jurados" DOUBLE PRECISION,
    "puntaje_desempate_profesores" DOUBLE PRECISION,
    "hubo_empate" BOOLEAN NOT NULL DEFAULT false,
    "posicion_final" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resultado_ranking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resultado_ranking_id_edicion_idx" ON "resultado_ranking"("id_edicion");

-- CreateIndex
CREATE INDEX "resultado_ranking_posicion_final_idx" ON "resultado_ranking"("posicion_final");

-- CreateIndex
CREATE UNIQUE INDEX "resultado_ranking_id_equipo_id_videojuego_id_edicion_key" ON "resultado_ranking"("id_equipo", "id_videojuego", "id_edicion");

-- AddForeignKey
ALTER TABLE "resultado_ranking" ADD CONSTRAINT "resultado_ranking_id_equipo_fkey" FOREIGN KEY ("id_equipo") REFERENCES "equipos"("id_equipo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultado_ranking" ADD CONSTRAINT "resultado_ranking_id_videojuego_fkey" FOREIGN KEY ("id_videojuego") REFERENCES "videojuegos"("id_videojuego") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultado_ranking" ADD CONSTRAINT "resultado_ranking_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE CASCADE ON UPDATE CASCADE;
