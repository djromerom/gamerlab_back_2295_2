# Ediciones (ferias) y datos por edición

> **Audiencia:** Backend, Frontend, DevOps, Scrum · **Actualizado:** 2026-11-05 · **Estado:** completo según backlog §10 (verificar implementación en `docs/editions.md`) · **Fuente:** backlog §4.1, §10.3, BG-17..BG-23, HU-26, HU-27, TA-17

## Concepto
Una edición es una versión anual de ARKAD. Estados: **activa, inactiva, archivada**. Semestre guardado como número (10, 20, 30). Hoy en producción: ediciones 1–5; la **5 (2026-S2, feria 26-nov-2026) es la activa**; casi todos los datos están en la 4 (inactiva).

## Reglas de datos por edición (decididas el 3-nov)
1. La **edición de trabajo es siempre la `ACTIVE`** y la decide el **servidor** (método central, HU-27).
2. Todo listado acepta una edición opcional; las anteriores se consultan como **historial de solo lectura**.
3. **Solo se escribe** (asignar, inscribir, calificar, quitar) sobre la edición activa.
4. La **cuenta del usuario es global**; la **participación** (estudiante, jurado) es **por edición**.
5. **No hay «traer de la edición anterior» para estudiantes**: cada estudiante se inscribe; haber participado antes no inscribe a nadie (BG-17, HU-26).
6. **Archivar** no borra datos vivos (borrar equipos se llevaría las evaluaciones). Archivar exige que esté inactiva, copia equipos y videojuegos al histórico y no se repite (TA-17 define qué hace «archivar» y vuelca la edición 4 al histórico).
7. Una edición puede crearse sin NRC, pero **no deben abrirse inscripciones sin ellos** (aviso en BG-23).
8. Los tickets de inscripción de estudiantes tienen la prioridad más alta.

## Qué cambió en la base (promoción del 4-nov, ARK-128)
`integrante.id_edicion` obligatoria; únicos por edición de correo, código estudiantil, líder y nombre de equipo (6 índices únicos incluyendo `codigo_equipo` y `codigo_verificacion`); permisos `LIST_EDITION_STUDENTS`, `LIST_EDITION_JURORS`, `MANAGE_EDITION_JURORS`, `VIEW_EVALUATION_TRACKING`. Volver atrás exige imagen anterior **y** restaurar el dump.

## Flujo de una edición nueva
Ver [reglas-de-negocio §8](reglas-de-negocio.md). Además: al crear/activar una edición se crea su configuración de evento (BG-15) o el toggle de inscripciones falla con «No se pudo actualizar las inscripciones». Cargar **NRC y ponderados** antes de abrir inscripciones (hoy la edición 5 aún no los tiene en prod: pendiente).

## Bugs de mezcla de ediciones (Sprint 2, Juan Álvarez)
BG-18 asignación manual no valida edición activa · BG-19 listas mezclan ediciones · BG-20 «Quitar todas las asignaciones» borra todas · BG-21 «Evaluaciones abiertas» sin edición · BG-22 reportes cuentan todas las ediciones · BG-23 lista NRC del admin mezcla y no avisa. Claves Jira: ver [backlog-y-epicas](../05-scrum-y-proceso/backlog-y-epicas.md).

## Consideraciones técnicas
- `GET /teams` sin parámetro devuelve solo la edición activa (hoy vacía): revisar galería pública y tablero de puntajes.
- Búsquedas de equipo por `userId` sin edición son un riesgo: un usuario puede tener equipos en dos ediciones.
- La asignación automática histórica usaba la edición de id más alto (la 4 conserva 433 asignaciones).

## Horas de las ediciones y zona horaria
Hallazgo de BG-14 (ARK-119, Rafael, 2-nov; cerrado el 6-nov como investigación):
- **Causa principal: dato mal guardado.** La hora de fin de «Feria Gamer 2025 - S2» quedó en 12:30 a. m. en vez de 12:30 p. m. (terminaba antes de empezar). Se corrigió en test el 2-nov a `2025-11-27T17:30:00.000Z`. > PENDIENTE: verificar el dato en producción.
- **Agravante: el front usa la zona horaria del navegador** para guardar y mostrar las horas (`buildISODateTime`, `isoToDate`, `isoToTime`, `formatTime`). Un administrador o visitante con el navegador fuera de hora de Colombia ve y guarda horas corridas. El «05:30 AM» del reporte era esa misma hora vista desde un navegador en UTC.
- **El back está bien:** guarda en UTC y, desde la validación de fechas, rechaza un fin anterior al inicio (400).
- **Mientras no se arregle (BG-34, ARK-157):** quien edite horas de ediciones debe tener el navegador en hora de Colombia.

## Históricos
Tablas `*_historico` (v1 + v2 consolidados: 197 equipos / 723 integrantes / 197 juegos). Ver [04-devops/base-de-datos-operacion](../04-devops/base-de-datos-operacion.md).

> PENDIENTE: contenido de `configuracion_evento` en producción (BG-21) y si HU-21 mezcla ediciones.
