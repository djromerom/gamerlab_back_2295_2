# Evaluación y ranking

> **Audiencia:** Backend · **Actualizado:** 2026-11-05 · **Estado:** parcial (leído de `evaluation.service.ts`, `counted-evaluations.ts`, `ranking.logic.ts`, `schema.prisma`; faltan detalles del servicio de ranking) · **Fuente:** `src/evaluation`, `src/ranking`

Reglas de negocio: [01-negocio/reglas-de-negocio](../01-negocio/reglas-de-negocio.md).

## Calificar
- `POST /evaluation/with-details` (una) y `POST /evaluation/batch` (lote). El profesor guarda notas por `POST /professors/team-evaluation` (y `/batch`).
- **Antes de guardar** se aplican bloqueos (`findEvaluationBlockers`): el actor debe estar asignado al grupo o ser Profesor dueño de un NRC del equipo en su edición; N0 exige además senior; el videojuego debe ser de la **edición activa** (se lanza 403 con el motivo). Después `teamVerification.assertVerified(jurorId, videogameId)`: el jurado debe haber digitado el código del grupo (HU-19).
- Debe existir al menos un criterio activo (`criterionService.findForSelect()`); el total se calcula con los pesos de los criterios (`buildDetails`).
- **Una evaluación por (jurado, videojuego)**: único `jurado_videojuego_unique`.
- **Idempotencia:** `contentHash` + `idempotencyKey` opcional; tabla `EvaluationIdempotency` (única por `(jurorId, key)`). Reintento con mismo contenido → misma respuesta; mismo juego con contenido distinto → 409 «Ya existe una evaluación…».
- **Lote:** de 1 a 50 filas; se valida **en memoria fila por fila** y se escribe todo o nada; un error de BD sale como 500 sin recibo de idempotencia; `videogameId` repetido en el lote se marca como error.
- `isSenior` se guarda en la evaluación (profesor y jurado senior).

## Evaluaciones que cuentan
`MAX_COUNTED_EVALUATIONS = 3` (`src/evaluation/counted-evaluations.ts`): se ordenan por fecha de envío (y por id si empatan) y cuentan las 3 primeras; las demás se guardan. Misma función para el seguimiento (HU-21) y la nota (HU-04).

## Nota final
Vista SQL `vw_team_final_scores` (`TeamFinalScore`): `avgJunior`, `avgSenior`, `finalScore` (ya redondeada a 2 decimales), `juniorEvaluations`, `juniorCounted`, `seniorEvaluations`, `weightingConfigured`. Junior = jurados (solo las 3 primeras); senior = profesor. Ponderación por edición en `Weighting` (`seniorPct`, `juniorPct`). Equipos `isExternal`: solo cuenta la nota junior.
> **Decidido el 6-nov (P-02, HU-34):** la nota final es 60 % el promedio de los profesores que calificaron al grupo y 40 % el promedio de los jurados junior. Si falta una de las dos partes, el grupo queda en «Nota en proceso» y sin posición en el ranking (las ediciones pasadas no cambian). Está en implementación (HU-34, Sprint 3), así que la vista y el servicio actuales pueden no reflejarlo aún.
> **Colegios (N0) y marca `isExternal`:** un colegio solo lo califican seniors, de modo que no tiene nota junior. Propuesta pasada al equipo el 7-nov: su nota final es el promedio de los seniors al 100 %. La marca `isExternal` en equipos que no son colegios no cambia hasta tener el conteo de Santiago (BG-37). Confirmar con los profesores si existen casos.
> El rol nuevo de **presentador externo** (HU-33) no es un equipo: no se califica y no entra a esta vista.

## Progreso
`GET /evaluation/progress` → `{ completed, assigned }`: evaluaciones activas con puntaje de jurados **actualmente asignados y activos** ÷ asignaciones vigentes de la edición (fuente única para Estadísticas, Estado de evaluación y Asignación).

## Ranking por nivel (HU-04)
- Lógica pura en `src/ranking/ranking.logic.ts`; el servicio la une a la BD. `DEFAULT_PODIUM_SIZE = 3`, `MIN_EVALUATIONS = 3`.
- El **nivel** sale del prefijo del código del equipo (`N{n}-…`). Empate = misma nota, mismo nivel y edición.
- **Desempate (P-05):** (1) todos los empatados comparten profesor → decide ese profesor (mientras no decida, orden provisional por inscripción); (2) si no comparten profesor, o el empate mezcla grupos del mismo profesor con otros → primero el inscrito antes; (3) misma fecha de inscripción → **resolución manual del administrador**.
- Endpoints: `GET /ranking`, `GET /ranking/winners`, `GET /ranking/ties`, `GET /ranking/decisions`, `GET /ranking/my-ties` (empates del profesor), `POST /ranking/ties/decision`, `POST /ranking/finalize`.
- `TieBreakDecision`: `tieKey` único (edición, nivel, nota y equipos): **si cambian las notas, el empate es otro y la decisión deja de aplicar**. `method`: `PROFESSOR | REGISTRATION | ADMIN`; guarda `orderedTeamIds`, motivo y quién decidió.
- `RankingResult` guarda la posición final por nivel cuando se finaliza.
- Visibilidad: el administrador controla `showRanking` (`/settings/show-ranking`) y `showEvaluations`; con el ranking oculto los promedios públicos devuelven `null` salvo para el admin; histórico con notas es público (ediciones archivadas).

## Pendiente
### `POST /ranking/finalize` (leído de `ranking.service.ts`)
1. Resuelve la edición (la indicada o la activa) y arma el ranking.
2. Si queda algún empate `PENDING` responde **409** con la lista (`pendingTies`: `tieKey`, nivel, regla): hay que resolverlos antes.
3. En **una transacción**: guarda como `TieBreakDecision` (método `REGISTRATION`, `skipDuplicates`) los empates resueltos automáticamente por inscripción; **borra** los `RankingResult` de esa edición y **los vuelve a crear** con la posición final por nivel (`baseScore`, `rankingScore`, `wasTied`, `finalPosition`).
4. Responde equipos por nivel y cuántas decisiones registró.
- **Es repetible:** reemplaza lo guardado antes para esa edición; las decisiones duplicadas se ignoran.
- `GET /teams/final-score/by-n/:n` usa `orderRows`: dentro de un nivel aplica el orden oficial (decisiones e inscripción); entre niveles con la misma nota, la inscripción. No escribe.
