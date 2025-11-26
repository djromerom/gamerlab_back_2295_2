-- CreateTable
CREATE TABLE "ponderado" (
    "id" SERIAL NOT NULL,
    "id_edicion" INTEGER NOT NULL,
    "senior_pct" DOUBLE PRECISION NOT NULL,
    "junior_pct" DOUBLE PRECISION NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ponderado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ponderado_id_edicion_key" ON "ponderado"("id_edicion");

-- AddForeignKey
ALTER TABLE "ponderado" ADD CONSTRAINT "ponderado_id_edicion_fkey" FOREIGN KEY ("id_edicion") REFERENCES "ediciones"("id_edicion") ON DELETE RESTRICT ON UPDATE CASCADE;
