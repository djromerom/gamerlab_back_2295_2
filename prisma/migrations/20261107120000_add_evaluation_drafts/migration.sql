-- HU-18 (ARK-104): borradores de evaluación de jurado en el servidor.
-- Solo agrega una tabla: no cambia ni borra datos existentes ni el catálogo RBAC
-- (las rutas usan el servicio existente 'Create Evaluation').

-- CreateTable
CREATE TABLE "borrador_evaluacion" (
    "id_borrador" SERIAL NOT NULL,
    "id_jurado" TEXT NOT NULL,
    "id_videojuego" INTEGER NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "puntajes" JSONB NOT NULL DEFAULT '[]',
    "comentarios" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "borrador_evaluacion_pkey" PRIMARY KEY ("id_borrador")
);

-- CreateIndex
CREATE INDEX "borrador_evaluacion_id_jurado_activo_idx" ON "borrador_evaluacion"("id_jurado", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "borrador_evaluacion_id_jurado_id_videojuego_key" ON "borrador_evaluacion"("id_jurado", "id_videojuego");

-- AddForeignKey
ALTER TABLE "borrador_evaluacion" ADD CONSTRAINT "borrador_evaluacion_id_jurado_fkey" FOREIGN KEY ("id_jurado") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrador_evaluacion" ADD CONSTRAINT "borrador_evaluacion_id_videojuego_fkey" FOREIGN KEY ("id_videojuego") REFERENCES "videojuegos"("id_videojuego") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "borrador_evaluacion" ADD CONSTRAINT "borrador_evaluacion_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;

