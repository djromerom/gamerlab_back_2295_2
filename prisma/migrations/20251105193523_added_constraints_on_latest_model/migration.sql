/*
  Warnings:

  - A unique constraint covering the columns `[id_edicion,titulo]` on the table `enfoque_educativo` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id_edicion,puesto]` on the table `podio` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id_edicion,nombre]` on the table `testimonio` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "enfoque_educativo_id_edicion_titulo_key" ON "enfoque_educativo"("id_edicion", "titulo");

-- CreateIndex
CREATE UNIQUE INDEX "podio_id_edicion_puesto_key" ON "podio"("id_edicion", "puesto");

-- CreateIndex
CREATE UNIQUE INDEX "testimonio_id_edicion_nombre_key" ON "testimonio"("id_edicion", "nombre");
