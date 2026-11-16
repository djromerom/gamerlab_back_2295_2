# Contrato de API · HU-14 · Contingencia con suplentes

**Para:** Jorge (Frontend) · **De:** Juan Alvarez (Backend)
**Ticket:** ARK-213 (backend) / ARK-214 (frontend) · **Historia:** ARK-34 · **Estado:** mergeado en `dev` (#292), con la migración `20261117000000_add_substitute_contingency`; pendiente desplegar en `Arkad-test`.
Swagger local: `http://localhost:3000/api` (sección *Juror*, rutas `/juror/contingency/...`)

## Qué hace
A la hora de control (11:00, o la del cronograma de HU-12), el administrador ve los **grupos en riesgo** (con menos jurados que cuentan que el mínimo) y una **sugerencia de suplentes** para cada uno. Acepta (por grupo o todo junto), rechaza o elige otro suplente de una lista.

- **Quién cuenta en un grupo:**
  - un jurado que **ya evaluó** el grupo, siempre;
  - **antes de la hora de control**, todos los asignados (todavía pueden llegar);
  - **desde la hora de control**, solo los que tienen la **llegada registrada** (HU-11).
- **Jurado que llega tarde:** vuelve a contar y conserva todos sus grupos, aunque un suplente ya esté calificando. Nada se le quita.
- **Jurado que se retira:** el que tiene a la vez las dos señales de HU-23, «posible salida» (sin actividad) y «presencia sin confirmar» (no respondió «Sigo aquí»). Deja de contar solo en los grupos que no ha evaluado y conserva su asignación. Quien responde «Sigo aquí» sigue contando aunque califique despacio.
- **Faltantes** = mínimo de evaluaciones (3 por defecto, configurable) − jurados que cuentan.
- **Candidatos:** usuarios con tipo **Suplente** confirmados en la edición activa (HU-25). Se ordenan así:
  1. mismo nivel (sus grupos actuales son de ese nivel, o todavía no tiene grupos);
  2. senior si el grupo es de colegio (en N0 solo se proponen seniors, porque un junior no puede calificar colegios);
  3. misma categoría que el jurado ausente;
  4. menos carga;
  5. con llegada registrada.

  La propuesta reparte la carga: no le da todos los grupos al mismo suplente.
- **Aceptar solo suma:** nadie pierde grupos y las evaluaciones hechas no se tocan. Un grupo puede quedar con más de 3 jurados; solo cuentan las 3 primeras evaluaciones (P-10).
- **Rechazar** deja registro de quién, cuándo y por qué. Ese suplente no se vuelve a sugerir para ese grupo, pero sigue en las alternativas.
- El mínimo configurable **no cambia la nota**: solo cuentan las 3 primeras evaluaciones (P-10).

## Roles y permisos
- Todo es del **Administrador**: `AssignJurors` para consultar, aceptar y rechazar, y `ManageFairSchedule` para cambiar el mínimo. No hay servicios nuevos.
- Staff, Profesor, Jurado, Estudiante y Presentador externo reciben **403**.

## Autenticación y errores (igual que el resto de la API)
- Sesión por cookie HttpOnly `access-token` (enviar con `credentials: 'include'`).
- Errores con el formato de Nest. En los **400** de validación, `message` es una **lista** de textos en español.
- **401**: sin sesión · **403**: el rol no tiene permiso · **404** `NO_ACTIVE_EDITION`: no hay edición activa.
- Los errores propios traen `code`: distinguirlos por `code`, no por el texto.
- Las fechas vienen en ISO 8601 UTC: mostrarlas en hora de Colombia.

## Cabecera común de las respuestas
```json
{
  "edicion": { "id": 3, "title": "Feria 2026-2" },
  "fase": "CONTROL",
  "base": "PRESENT",
  "minimoEvaluaciones": 3,
  "generadoEn": "2026-11-26T16:30:00.000Z"
}
```
- `fase`: `NOT_CONFIGURED`, `BEFORE_ALERT`, `ALERT`, `CONTROL` o `CLOSED` (la de HU-12).
- `base`: `ASSIGNED` antes de la hora de control y `PRESENT` desde ella.
- Las rutas responden a cualquier hora: el administrador puede abrir el caso antes (CU-14). Si `base` es `ASSIGNED`, conviene mostrar «Aún no es la hora de control: se cuentan todos los asignados».

## `GET /juror/contingency/groups-at-risk`
Grupos en riesgo de la edición activa, de más a menos faltantes. No guarda nada.
```json
{
  "...cabecera": "...",
  "grupos": [
    {
      "teamId": 12, "codigo": "N1-AYP-06", "nombre": "Pixel Hunters", "videojuego": "Pixel Quest", "nivel": 1,
      "juradosContados": 2, "faltantes": 1,
      "jurados": [
        { "id": "uuid", "nombre": "Ana Pérez", "categoria": "JUNIOR", "estado": "ABSENT", "evaluo": false, "cuenta": false },
        { "id": "uuid", "nombre": "Luis Díaz", "categoria": "JUNIOR", "estado": "PRESENT", "evaluo": true, "cuenta": true }
      ]
    }
  ]
}
```
`estado` puede ser `PRESENT`, `ABSENT` o `LEFT` (se retiró). `cuenta` dice si ese jurado cuenta hoy para el grupo.

## `GET /juror/contingency/suggestions`
Lo mismo de `groups-at-risk`, y además, por grupo:
```json
{
  "sugeridos": [
    { "id": "uuid", "nombre": "Laura Gómez", "categoria": "JUNIOR", "carga": 1, "llegada": true, "mismoNivel": true, "mismaCategoria": true, "rechazado": false }
  ],
  "alternativas": [ { "...": "mismo formato, en el mismo orden" } ],
  "sinCubrir": 0,
  "advertencias": [ { "code": "JUROR_OVER_LIMIT", "message": "...", "jurorId": "uuid" } ]
}
```
Y en la raíz: `totales` (`gruposEnRiesgo`, `faltantes`, `sugeridos`, `sinCubrir`) y `suplentesDisponibles`.
- `carga`: grupos que tendría el suplente si se acepta todo.
- `alternativas`: los demás suplentes posibles, para «Elegir otro». Un rechazado sale con `rechazado: true`.
- `sinCubrir`: faltantes para los que no hay suplente; el grupo seguirá con menos de 3 y queda marcado en el ranking (HU-04).
- `advertencias`: las de HU-08 si se aceptan los sugeridos. Conviene mostrarlas antes de aceptar.
- No guarda nada.

## `POST /juror/contingency/suggestions/accept`
Sirve para «Aceptar» un grupo, «Aceptar todo» y «Elegir otro» (un suplente de `alternativas`).
```json
{ "assignments": [ { "teamId": 12, "substituteId": "uuid" } ], "confirmWarnings": false }
```
- De 1 a 200 pares. Para **aceptar todo**, envía todos los `sugeridos` de todos los grupos.
- **409 `ASSIGNMENT_WARNINGS`** con `warnings`: muestra la confirmación, como en «Asignar equipo» (`AssignmentWarningsDialog`), y reenvía lo mismo con `confirmWarnings: true`.
- **400 `NOT_A_SUBSTITUTE`** (con `substituteIds`): alguien no es Suplente confirmado de la edición. **400** con otro `code`: un bloqueo de HU-08 (por ejemplo `SCHOOL_REQUIRES_SENIOR`). **404 `TEAM_NOT_FOUND`** (con `teamIds`).
- Si algo falla no se guarda nada (una sola transacción). Los pares que ya existían se omiten sin error.
- Respuesta 200:
```json
{
  "message": "Se agregaron 2 asignaciones de suplentes en 2 grupos. Nadie perdió grupos.",
  "edicion": { "id": 3, "title": "Feria 2026-2" },
  "suplentes": [
    {
      "id": "uuid", "nombre": "Laura Gómez",
      "equiposAgregados": [ { "id": 12, "codigo": "N1-AYP-06", "nombre": "Pixel Hunters" } ],
      "equiposYaAsignados": []
    }
  ],
  "totales": { "asignacionesAgregadas": 2, "asignacionesOmitidas": 0 },
  "advertenciasAceptadas": []
}
```
Cada suplente recibe el aviso «Te asignaron grupos» (HU-22) y una notificación push.

## `POST /juror/contingency/suggestions/reject`
```json
{ "teamId": 12, "substituteIds": ["uuid"], "reason": "Prefiero a un profesor del área" }
```
- **Envía siempre los `substituteIds` que mostraste en pantalla.** Si no se envían, el servidor recalcula la sugerencia en ese momento, y puede no ser la misma que veía el administrador (por ejemplo, si alguien acaba de llegar).
- `reason` es opcional, de máximo 500 caracteres.
- **400 `NO_SUGGESTION_TO_REJECT`** (el grupo no tiene sugerencia) o **`NOT_A_SUBSTITUTE`**; **404 `TEAM_NOT_FOUND`**.
- No cambia asignaciones. Después de rechazar, vuelve a pedir `suggestions`: el grupo trae otro sugerido o queda con `sinCubrir`.
- Respuesta 200:
```json
{
  "message": "Se rechazó la sugerencia para N1-AYP-06: Laura Gómez no se volverá a sugerir para este grupo. Puedes asignar a mano a otro suplente.",
  "equipo": { "id": 12, "codigo": "N1-AYP-06", "nombre": "Pixel Hunters" },
  "suplentesRechazados": [ { "id": "uuid", "nombre": "Laura Gómez" } ],
  "motivo": "Prefiero a un profesor del área",
  "rechazadoEn": "2026-11-26T16:32:00.000Z"
}
```

## `GET /juror/contingency/settings` · `PUT /juror/contingency/settings`
```json
{ "minEvaluationsPerTeam": 3 }
```
- `GET` responde `edicion`, `minEvaluationsPerTeam` y `cronograma` (las horas de HU-12). Las horas se siguen cambiando con `PUT /absence-alert/schedule`.
- `PUT` acepta de 1 a 10 y responde lo mismo que `GET`. **404 `EVENT_CONFIGURATION_NOT_FOUND`** si la edición activa no tiene configuración del evento.

## Sugerencia de pantalla (ARK-214)
1. **Grupos en riesgo** (`suggestions`): cada grupo con sus jurados y su estado (`ABSENT`, `LEFT`, `PRESENT`), los sugeridos con `carga` y `llegada`, `sinCubrir` y las advertencias. Botones «Aceptar», «Rechazar» y «Elegir otro» (abre `alternativas`). Arriba, «Aceptar todo».
2. **Confirmación de advertencias:** reutilizar `AssignmentWarningsDialog`.
3. **Parámetros:** campo «Mínimo de evaluaciones por grupo» junto al cronograma.
4. **Entrada:** desde la alerta de inasistencia (HU-12) o el panel de seguimiento. Durante la feria, refrescar cada 30 a 60 segundos.

## Cómo se probó (backend)
- Unitarias de la lógica: quién cuenta antes y después de las 11:00, el que llega tarde, el que se retira, el mínimo, el orden de los suplentes, colegios, reparto de carga, rechazados y lo que queda sin cubrir.
- **Contra Postgres real**, en la fase de control:
  - el grupo con un ausente queda en riesgo;
  - se sugiere el suplente de la misma categoría;
  - rechazar registra y pasa al suplente a las alternativas;
  - un oficial no se acepta como suplente;
  - aceptar suma con bitácora, aviso y push, y el grupo sale del riesgo;
  - repetir no duplica;
  - quien se retira deja de contar y conserva su grupo;
  - el que llega tarde conserva su grupo y vuelve a contar.
- **No probado:** la pantalla y la feria real.
