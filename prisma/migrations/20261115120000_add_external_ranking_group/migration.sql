-- HU-38 (ARK-219): ranking y podio propio para los equipos externos.
--
-- Los equipos externos (equipos.externo, salvo los colegios N0) ya no compiten en su nivel: forman
-- el grupo «Externos». Para guardar a qué grupo pertenece cada posición y cada desempate:
-- 1) resultado_ranking.grupo_externo: la posición final es dentro del grupo Externos.
-- 2) decision_desempate.grupo_externo: el empate es del grupo Externos. Como ese grupo mezcla
--    niveles, decision_desempate.nivel pasa a admitir NULL en esos empates.
--
-- No borra ni cambia datos: las filas existentes quedan con grupo_externo = false.

ALTER TABLE "resultado_ranking" ADD COLUMN "grupo_externo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "decision_desempate" ADD COLUMN "grupo_externo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "decision_desempate" ALTER COLUMN "nivel" DROP NOT NULL;
