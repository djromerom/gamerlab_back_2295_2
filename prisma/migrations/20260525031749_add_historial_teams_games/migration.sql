-- CreateTable
CREATE TABLE "equipos_historico" (
    "id_equipo_historico" SERIAL NOT NULL,
    "nombre_equipo" VARCHAR(50) NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "externo" BOOLEAN NOT NULL DEFAULT false,
    "codigo_equipo" VARCHAR(12) NOT NULL,

    CONSTRAINT "equipos_historico_pkey" PRIMARY KEY ("id_equipo_historico")
);

-- CreateTable
CREATE TABLE "integrante_historico" (
    "id_integrante_historico" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "apellido" VARCHAR(50) NOT NULL,
    "correo" VARCHAR(100) NOT NULL,
    "codigo_estudiantil" VARCHAR(100) NOT NULL,
    "id_equipo_historico" INTEGER NOT NULL,

    CONSTRAINT "integrante_historico_pkey" PRIMARY KEY ("id_integrante_historico")
);

-- CreateTable
CREATE TABLE "videojuegos_historico" (
    "id_videojuego_historico" SERIAL NOT NULL,
    "nombre" VARCHAR(30) NOT NULL,
    "descripcion" TEXT,
    "logo_url" TEXT,
    "id_equipo_historico" INTEGER NOT NULL,
    "repo_url" TEXT,
    "video_url" TEXT,
    "imagenes_adicionales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivo_videojuego_url" TEXT,
    "entry" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "videojuegos_historico_pkey" PRIMARY KEY ("id_videojuego_historico")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipos_historico_codigo_equipo_id_edicion_key" ON "equipos_historico"("codigo_equipo", "id_edicion");

-- CreateIndex
CREATE UNIQUE INDEX "videojuegos_historico_id_equipo_historico_key" ON "videojuegos_historico"("id_equipo_historico");

-- AddForeignKey
ALTER TABLE "equipos_historico" ADD CONSTRAINT "equipos_historico_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrante_historico" ADD CONSTRAINT "integrante_historico_id_equipo_historico_fkey" FOREIGN KEY ("id_equipo_historico") REFERENCES "equipos_historico"("id_equipo_historico") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "videojuegos_historico" ADD CONSTRAINT "videojuegos_historico_id_equipo_historico_fkey" FOREIGN KEY ("id_equipo_historico") REFERENCES "equipos_historico"("id_equipo_historico") ON DELETE CASCADE ON UPDATE NO ACTION;
