-- ARK-258 (BG-57): fecha del último envío del certificado de presentador externo de un equipo
-- no calificable (HU-39). El administrador la ve en «Presentadores externos», como la de los
-- presentadores que son una persona (`presentador_externo.certificado_enviado_en`).
-- Null: el certificado del equipo no se ha enviado. Los equipos existentes quedan en null.
ALTER TABLE "equipos" ADD COLUMN "certificado_presentador_enviado_en" TIMESTAMP(3);
