CREATE TABLE "integrante_historico_nrc" (
    "id" SERIAL NOT NULL,
    "id_integrante_historico" INTEGER NOT NULL,
    "id_nrc" INTEGER NOT NULL,
    "codigo" INTEGER NOT NULL,

    CONSTRAINT "integrante_historico_nrc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integrante_historico_nrc_id_integrante_historico_id_nrc_key"
ON "integrante_historico_nrc"("id_integrante_historico", "id_nrc");

CREATE INDEX "integrante_historico_nrc_id_nrc_idx"
ON "integrante_historico_nrc"("id_nrc");

ALTER TABLE "integrante_historico_nrc"
ADD CONSTRAINT "integrante_historico_nrc_id_integrante_historico_fkey"
FOREIGN KEY ("id_integrante_historico") REFERENCES "integrante_historico"("id_integrante_historico")
ON DELETE CASCADE ON UPDATE NO ACTION;
