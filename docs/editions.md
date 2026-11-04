# Ediciones: qué es global y qué es por edición (HU-27 / ARK-130)

Una **edición** es una feria (por ejemplo, «Feria Gamer 2026 - S2»). Solo una está **ACTIVE** a la vez: es la **edición de trabajo**.

## La regla

| | Qué se hace | Dónde se exige |
|---|---|---|
| **Leer** | Todo listado acepta `?editionId=`; si no se envía, usa la edición ACTIVE. Las demás ediciones se consultan como historial. | `resolveListEdition` (`src/editions/list-edition.ts`) y `resolveEdition` (`src/juror-edition/edition-resolver.ts`) |
| **Escribir** | Inscribir, editar, borrar, asignar jurados, cambiar NRC, ponderados y calificar solo sobre datos de la edición ACTIVE. Lo exige el **servidor**, no la pantalla. | `assertTeamWritable`, `assertNrcWritable`, `assertVideogameWritable`, `assertMemberWritable` y `assertEditionWritable` (`src/editions/active-edition.ts`) |
| **Una sola fuente** | La edición activa sale de `findActiveEdition` / `requireActiveEdition`, o del filtro `ACTIVE_EDITION_WHERE` dentro de otra consulta. Nunca «la edición con el id más alto»: una edición nueva se crea INACTIVE. | `src/editions/active-edition.ts`. La prueba `active-edition.regression.spec.ts` falla si alguien filtra la edición a mano. |

Intentar modificar datos de otra edición responde **400**:

```json
{
  "statusCode": 400,
  "code": "EDITION_READ_ONLY",
  "message": "No se puede modificar el equipo: pertenece a «Feria gamer - S2», que no es la edición activa. Las ediciones anteriores son de solo lectura."
}
```

**Excepción:** la lista de jurados de una edición (HU-25) también acepta cambios en una edición INACTIVE que aún no terminó, para prepararla antes de activarla (`isWritable` en `edition-resolver.ts`, decisión del 2026-11-02).

## Global (no cambia entre ediciones)

| Qué | Modelos |
|---|---|
| Cuentas y acceso | `User`, `Role`, `Permission`, `Service`, `RolePermission`, `ServicePermission`, `ConfirmationStatus` (correo verificado), `TokenType`, `VerificationToken`, `RefreshToken` |
| Catálogos | `Subject` (materias), `Criterion` (criterios de calificación), `VideogameStatus` |
| Archivos | `Upload` |

La **cuenta** del estudiante, del jurado y del profesor es una sola para todas las ediciones (BG-17). El estado de la cuenta (correo verificado) también es global.

## Por edición (columna `id_edicion`)

| Qué | Modelos |
|---|---|
| Configuración | `EventConfiguration` (inscripciones, evaluaciones abiertas, ranking), `Weighting` (ponderados) |
| Inscripción | `Team`, `Member` (BG-17: correo y código únicos por edición), `NRC` |
| Jurados | `JurorEdition` (HU-25), `JurorBadge`, `JurorAttendance` |
| Calificación | `Evaluation`, `RankingResult`, `TieBreakDecision` |
| Contenido de la edición | `HighlightedGame`, `EducationalFocus`, `Testimonial` |
| Histórico | `HistoricalTeam` |

## Por edición a través de su equipo (no tienen `id_edicion` propio)

`Videogame`, `VideogameLike`, `TeamVerification`, `TeamVerificationLog`, `EvaluationDetail` (por su evaluación), `EvaluationIdempotency`, `JurorAssignmentAuditLog` y la asignación jurado-equipo (`_JurorTeamAssignment`). Para saber su edición se mira la del equipo. `HistoricalMember`, `HistoricalMemberNrc` y `HistoricalVideogame` cuelgan de `HistoricalTeam`.

## Pendientes que se apoyan en esta regla

- BG-18: la validación de HU-08 y la participación del evaluador en la edición (el bloqueo por edición del equipo ya está en `JurorAssignmentService`).
- BG-19: los listados de asignaciones, «falta jurado», el panel del jurado y `juror-evaluations` del profesor.
- BG-20: «Quitar todas las asignaciones» solo en la edición activa.
- BG-22: los reportes de jurados.
- BG-23: la lista de NRC del administrador.
