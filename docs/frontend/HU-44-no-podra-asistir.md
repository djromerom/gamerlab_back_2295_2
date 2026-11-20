# Contrato back → front: «No podrá asistir» y grupos de cada ausente (HU-44)

**Back:** ARK-293 (Rafael), rama `fix/ARK-293-ausente-confirmado`, PR a `dev`.
**Front:** ARK-294 (Rafael), sobre `dev-deploy`.
**Decisión de Allison (19-nov):** «No podrá asistir» deja al jurado como ausente confirmado, **sin quitarle los grupos**; se cubren con suplentes.

## 1. Qué cambia en el back

| Antes | Desde ARK-293 |
|---|---|
| Las respuestas de HU-13 eran solo informativas | La **última** respuesta `CANNOT_ATTEND`, sin check-in después, deja al jurado como **ausente confirmado** |
| `AlertJuror` no traía grupos | Cada jurado trae `groups` y `pendingGroups` |
| El que no venía seguía en `missingJurors` | Sale de `missingJurors` y va a la lista nueva `notComingJurors` |
| Contingencia solo lo contaba como ausente desde las 11:00 | Lo cuenta como ausente **de inmediato** y propone suplentes para sus grupos |

- «Viene en camino» (`ON_THE_WAY`) y «Sin respuesta» (`NO_RESPONSE`) siguen siendo informativas. Si se registran **después** de un «No podrá asistir», el jurado vuelve a «Faltan por llegar».
- Si el jurado hace check-in, deja de ser «No vendrá» (aunque luego se anule esa llegada).
- El historial (`GET /absent-juror-responses/:jurorId`) no cambia y se conserva completo.
- Un suplente que «No podrá asistir» no se propone en Contingencia.

## 2. `GET /absence-alert`

```json
{
  "phase": "ALERT",
  "alertActive": true,
  "totals": { "present": 42, "missing": 70, "notComing": 1, "total": 113 },
  "missingJurors": [
    {
      "jurorId": "7a1c…", "name": "Luis Gómez", "category": "Junior", "isProfessor": false,
      "type": "OFFICIAL", "state": "NO_CHECK_IN", "checkedInAt": null,
      "notComing": false, "notComingSince": null,
      "groups": [ { "teamId": 41, "teamCode": "N2-AYP-07", "level": "N2", "evaluated": false } ],
      "pendingGroups": 1
    }
  ],
  "notComingJurors": [
    {
      "jurorId": "9b2d…", "name": "Ana Ruiz", "category": "Junior", "isProfessor": false,
      "type": "OFFICIAL", "state": "ABSENT", "checkedInAt": null,
      "notComing": true, "notComingSince": "2026-11-26T15:10:00.000Z",
      "groups": [ { "teamId": 41, "teamCode": "N2-AYP-07", "level": "N2", "evaluated": false } ],
      "pendingGroups": 1
    }
  ],
  "groups": [ ]
}
```

- `groups`: los grupos asignados al jurado (código, nivel `N0`…`N10` o `null`, y si ya lo calificó). Ordenados por código.
- `pendingGroups`: cuántos de esos le faltan por calificar.
- `missingJurors` = «Faltan por llegar» (desde la hora de alerta, como antes), **sin** los que no vendrán.
- `notComingJurors` = «No vendrán». Llega **a cualquier hora**, también antes de la hora de alerta. Siempre con `state: "ABSENT"`.
- `totals.missing` ya no cuenta a los que no vendrán; `totals.notComing` los cuenta aparte.
- `alertActive` también es `true` desde la hora de alerta si hay alguien en «No vendrán».

`GET /absence-alert/panel`: cada jurado trae `notComing` y `notComingSince` (no trae `groups`). El que no vendrá sale `ABSENT` también antes de la hora de control, así que el filtro «Ausentes» lo incluye.

## 3. Contingencia (`GET /juror/contingency/groups-at-risk` y `/suggestions`)

Cada jurado de un grupo trae `noVendra: boolean`. El que no vendrá tiene `estado: "ABSENT"` y `cuenta: false` en los grupos que no ha calificado. Sus grupos aparecen en riesgo con los suplentes sugeridos, aunque no sea la hora de control.

## 4. Qué hay que hacer en el front (ARK-294)

1. **Tipos** (`src/features/jurors/presence/api/absenceAlert.ts`): agregar a `AlertJuror` `notComing`, `notComingSince`, `groups` y `pendingGroups`; a `AbsenceAlert`, `notComingJurors`; a `AlertTotals`, `notComing`. En `contingency.ts`, `noVendra` en el jurado del grupo.
2. **Grupos en cada ausente** (`RealtimeTrackingPage.tsx`, lista «Jurados sin check-in», ~línea 345): debajo del nombre, los códigos con su nivel (por ejemplo `N2-AYP-07 · N2`) y «Le faltan N por calificar» con `pendingGroups`. Que se lea bien a 360 px (envolver).
3. **Bloque «No vendrán (N)»** con `notComingJurors`: nombre, grupos, desde qué hora (`notComingSince` en hora de Bogotá) y el botón **«Cubrir con suplentes»** que abre `/contingencia-suplentes`. Mostrarlo **también cuando la alerta no está activa** (antes de las 10:00 hoy solo se ve el contador). Solo el Administrador ve el botón, como «Sugerir suplentes».
4. **«Faltan por llegar»**: el título y el contador usan `missingJurors.length` y `totals.missing` (ya sin los que no vendrán).
5. **Diálogo «Registrar respuesta»**: un texto corto en cada opción:
   - «Viene en camino»: sigue en «Faltan por llegar»; solo queda la nota.
   - «No podrá asistir»: pasa a «No vendrán» y sus grupos se cubren con suplentes en Contingencia. No se le quitan los grupos; si llega, vuelve a la normalidad.
   - «Sin respuesta»: sigue en «Faltan por llegar»; solo queda la nota.
   Después de guardar, recargar la alerta para que el jurado cambie de bloque. Si el back responde 409 (`JUROR_ALREADY_CHECKED_IN`), mostrar el mensaje y recargar.
6. **Contingencia** (opcional): mostrar «No vendrá» junto al jurado con `noVendra: true`.

## 5. Cómo probarlo en Arkad-test

1. Con un jurado sin check-in que tiene grupos, la lista de ausentes muestra sus grupos y cuántos le faltan.
2. Registrar «No podrá asistir»: sale de «Faltan por llegar» y aparece en «No vendrán» con sus grupos; el contador baja.
3. «Cubrir con suplentes» abre Contingencia con sus grupos en riesgo y suplentes sugeridos, aunque no sean las 11:00.
4. Registrar después «Viene en camino»: vuelve a «Faltan por llegar» y sus grupos salen de Contingencia (si no hay otra falta).
5. Hacer check-in del jurado: sale de las dos listas; sus grupos siguen asignados a él.
6. El historial de respuestas sigue mostrando todas las respuestas.
