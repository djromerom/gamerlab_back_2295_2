# Contrato de API · BG-67 · Notas solo con el ranking publicado y /reports solo para el Administrador

**Para:** Camilo Acevedo (Frontend) · **De:** Samuel Tilano (Backend)
**Ticket:** ARK-267 (historia) · ARK-268 (backend) · **Rama backend:** `fix/ARK-268-reports-hide-grades` · **Estado:** implementado en la rama, pendiente de PR. Sin migración.

## Qué cambia
1. **Una sola regla de «notas publicadas»:** las notas se ven sin permiso solo si el Administrador **liberó la nota final** (`PATCH /final-grade/release`) **y** **publicó el ranking** (`PATCH /settings/show-ranking`). Así «Mis Calificaciones» y `/ranking` nunca muestran cosas distintas: con el ranking publicado, el estudiante ya ve su nota.
2. **El ranking no se puede publicar antes de liberar la nota final**, y la nota final solo se libera desde la hora de cierre de la feria (26-nov, 12:00 o la hora del cronograma).
3. **`/reports/videojuegoData`, `/reports/NRCData` y `/reports/DatosGraficoMateria` dejan de ser públicas:** solo el Administrador. Traen integrantes, notas, promedios junior/senior y el promedio por NRC. Hoy solo las usa `/estadisticas`.
4. `GET /reports/materiaData` sigue pública (solo nombres de materias).

## Roles
| Ruta | Sin sesión | Estudiante, Profesor, Jurado, Staff | Administrador |
|---|---|---|---|
| `GET /reports/videojuegoData` · `NRCData` · `DatosGraficoMateria` | **401** | **403** | 200, siempre con notas |
| `GET /reports/materiaData` | 200 | 200 | 200 |
| `GET /settings/show-ranking` | 200 | 200 | 200 |
| `PATCH /settings/show-ranking` | 401 | 403 | 200 o **400** |
| `GET /teams/final-score/*` | Igual que hoy, con la regla nueva | Igual que hoy | Igual que hoy |

## Rutas

### `GET /reports/videojuegoData` · `GET /reports/NRCData` · `GET /reports/DatosGraficoMateria`
Servicio `ExportAdminReports` (el mismo de `exportExcel`). Query `editionId?` igual que antes. La respuesta tiene **la misma forma que hoy**; como solo entra el Administrador, las notas siempre vienen (antes, con el ranking oculto, el público recibía `null`).

| Código | Cuándo | Qué hacer |
|---|---|---|
| 200 | Administrador | Igual que hoy |
| 401 | Sin sesión | **No pedir estas rutas sin sesión** (ver «Qué cambiar en el front») |
| 403 | Otro rol | **No pedirlas** si el usuario no es Administrador |
| 400 / 404 | `editionId` inválido o que no existe | Igual que hoy |

### `GET /settings/show-ranking` (pública, misma forma)
```json
{ "showRanking": true }
```
Ahora es `true` solo si el ranking está publicado **y** la nota final está liberada. `RankingPage` puede seguir usándola para decidir si muestra el ranking.

### `PATCH /settings/show-ranking` · `UpdateSettings` (Administrador)
Body `{ "show": boolean }`. Respuesta 200 `{ "showRanking": boolean }`. **Nuevo 400** al publicar sin la nota final liberada:
```json
{
  "statusCode": 400,
  "code": "RANKING_REQUIRES_FINAL_GRADE",
  "message": "Primero libera la nota final; el ranking se publica después."
}
```
Ocultar (`show:false`) se puede siempre.

### `PATCH /final-grade/release` `{ show: false }`
Además de ocultar la nota final, **apaga el ranking público**. La respuesta no cambia. Después de ocultar, conviene volver a leer `GET /settings/show-ranking` para que el interruptor «Ranking Público» de la configuración del evento quede apagado.

## Qué cambiar en el front
1. **`GlobalStateContext.fetchGlobalData`:** hoy pide las cuatro rutas de `/reports` para cualquier visitante. Pedir `videojuegoData`, `NRCData` y `DatosGraficoMateria` **solo si el usuario es Administrador** (o solo al entrar a `/estadisticas`). Sin eso, los visitantes reciben 401 y `apiFetch` intentará renovar la sesión. `materiaData` se puede seguir pidiendo siempre.
2. **Configuración del evento (`EventConfigurationPage`), interruptor «Ranking Público»:** si `PATCH /settings/show-ranking` responde 400 con `RANKING_REQUIRES_FINAL_GRADE`, mostrar el `message` y dejar el interruptor apagado. Sugerencia: un texto bajo el interruptor que diga «Se habilita después de liberar la nota final».
3. **«Mis Calificaciones» (`Scoreboard.tsx`):** no necesita cambios de API. Con `NOT_RELEASED` el texto «La nota final se publica al terminar la feria» ahora es coherente con `/ranking`, porque el ranking ya no puede estar publicado sin la nota liberada.
4. `/estadisticas` (solo Administrador) no cambia: recibe las mismas formas.

## Despliegue
Conviene mergear el back y el front el mismo día. Mientras tanto, en Arkad-test las páginas públicas mostrarán errores 401 de `/reports` en la consola, pero no fallará nada visible. En Arkad-test hoy `showRanking=true` con la nota final sin liberar; con el back nuevo, `/ranking` queda oculto sin tocar datos.

## Preguntas para Frontend
1. ¿Prefieres condicionar `fetchGlobalData` al rol o moverlo a `StatisticsPage`?
