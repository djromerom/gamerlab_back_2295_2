# Changelog de la documentación

> Registro de qué existe y en qué estado. Actualizar en cada cambio.

## 2026-11-20: check-in obligatorio para calificar (BG-71, ARK-285)
- [evaluación y ranking](../02-backend/evaluacion-y-ranking.md) y [jurados](../01-negocio/jurados.md): `findEvaluationBlockers` agrega el bloqueo «sin check-in» (409 `JUROR_NOT_CHECKED_IN`) para el envío individual, el lote (de toda la petición) y el guardado de borradores; la lista de borradores no lo aplica. El Profesor que califica solo por su NRC (sin estar asignado) queda exento. Sin migración ni permiso nuevo.
- Contrato nuevo `docs/frontend/BG-71-check-in-para-calificar.md`.

## 2026-11-20: el seguimiento cuenta solo evaluaciones de jurado (BG-73, ARK-284)
- [evaluación y ranking](../02-backend/evaluacion-y-ranking.md) y [jurados](../01-negocio/jurados.md): «Recibidas», «Cuentan», «Faltan», la tabla por hora y la alerta de HU-12 excluyen la nota del profesor a sus NRC (filtro único `JUROR_EVALUATION_FILTER`). Sin migración ni cambio de contrato (mismos campos). Queda anotada la diferencia con la marca «Menos de 3 evaluaciones» del ranking (BG-68), que la vista cuenta con la nota del profesor.

## 2026-11-17: ver de quién es un QR antes de registrar la llegada (BG-49, ARK-251)
- [endpoints](../02-backend/endpoints.md): `GET /juror-checkin/badge?token=` (permiso `JurorCheckIn`, Staff y Administrador). Misma validación que `POST scan` (404 «Código QR no válido o de otra edición»), devuelve `juror` (id, nombre, categoría, grupos) y `checkedInAt` de la llegada activa (una anulada no cuenta) sin crear ni cambiar la asistencia. Pedido del front para ARK-252.
- [jurados](../01-negocio/jurados.md#flujo-del-día-de-la-feria): al leer un QR la mesa confirma con el nombre antes de registrar.
- [inventario-de-rutas](../02-backend/inventario-de-rutas.md): se agrega a mano la ruta nueva.
- Contrato `docs/frontend/BG-49-anular-llegada.md`: sección nueva de la vista previa del QR. Sin migración ni permiso nuevo.

## 2026-11-16: notas solo con el ranking publicado y /reports solo para el Administrador (BG-67, ARK-268)
- [evaluación y ranking](../02-backend/evaluacion-y-ranking.md): una sola regla de «notas publicadas» (`showRanking` y `showFinalGrade`). `PATCH /settings/show-ranking` responde 400 `RANKING_REQUIRES_FINAL_GRADE` sin la nota final liberada, y ocultar la nota final también oculta el ranking. Las tres rutas de notas de `/reports` pasan a ser solo del Administrador.
- [inventario-de-rutas](../02-backend/inventario-de-rutas.md): `GET /reports/videojuegoData`, `/NRCData` y `/DatosGraficoMateria` pasan de «Pública» a permiso `ExportAdminReports`; notas nuevas en `GET`/`PATCH /settings/show-ranking`. Se edita a mano; el resto sigue siendo la foto de `origin/main`.
- Contrato para el front en `docs/frontend/BG-67-notas-solo-publicadas.md` (Camilo, ARK-267). Sin migración.

## 2026-11-17: Históricos del profesor solo con sus NRC y semestre legible (BG-63, ARK-263)
- [decisiones abiertas](../01-negocio/decisiones-abiertas.md): se cierra «¿Históricos muestra solo sus NRC o todos?» con la decisión de kary del 17-nov (solo sus NRC; el Administrador, todos), que revierte la vista histórica global del 2026-10-29.
- [ediciones](../01-negocio/ediciones.md#históricos) y [equipos y verificación](../01-negocio/equipos-y-verificacion.md): `GET /professors/grading-games?includeHistorical=true` y `grading-games/filter-options` filtran los equipos y NRC históricos por los NRC del profesor (`integrante_historico_nrc.id_nrc`); los equipos sin NRC solo los ve el Administrador; `metadata.totalItems` es el total real.
- [reglas de negocio](../01-negocio/reglas-de-negocio.md): etiqueta de semestre única (`src/editions/semester-label.ts`): «2026 - 1», «2026 - Intersemestral», «2026 - 2»; en el nombre del Excel `2026-1`, `2026-intersemestral`, `2026-2`. El Excel de calificaciones marca los equipos rechazados con «(rechazado)» en la columna Equipo.
- [checklist de traspaso](../05-scrum-y-proceso/checklist-traspaso-v5.md): «histórico del profesor» ya no es una decisión abierta.

## 2026-11-17: búsqueda y origen en GET /teams (BG-53, ARK-253)
- [endpoints](../02-backend/endpoints.md): `GET /teams` acepta `search` (nombre del equipo, nombre del juego y código del equipo, sin tildes ni mayúsculas; cada palabra debe aparecer) y `origin` (`uninorte` o `externo`, mapeado a `isExternal`; otro valor responde 400). Se filtran en la consulta, con y sin `limit`, así que buscar un equipo de otra página lo encuentra y `metaData.totalItems` es el total filtrado. Sin `search` ni `origin` la respuesta no cambia. No busca por correos, integrantes ni código de verificación.
- La búsqueda reusa `src/common/utils/search-text.ts` (BG-60) en `src/teams/repositories/team-list-filter.ts`: trae solo id, nombre, código y juego de la edición, filtra en memoria y pagina en la BD por esos ids; sin `unaccent` ni migraciones. El front (debounce, volver a la página 1, «Filas: Todos») va en ARK-254.

## 2026-11-17: anular una llegada de jurado (BG-49, ARK-251)
- [endpoints](../02-backend/endpoints.md): `PATCH /juror-attendance/:attendanceId/annul` (servicio `AnnulJurorArrival`, solo Administrador) y `attendanceId` en cada fila de `GET /juror-attendance`.
- [modelo-de-datos](../02-backend/modelo-de-datos.md): columnas `anulado_en`, `anulado_por` y `motivo_anulacion` en `asistencia_jurado` (migración `20261119000000_add_juror_arrival_annulment`, solo agrega columnas e inserta el servicio).
- [jurados](../01-negocio/jurados.md#flujo-del-día-de-la-feria): quién anula una llegada y qué cambia.
- [inventario-de-rutas](../02-backend/inventario-de-rutas.md): se agrega a mano la ruta nueva; el resto sigue siendo la foto de `origin/main`.
- Contrato para el front en `docs/frontend/BG-49-anular-llegada.md` (Camilo).

## 2026-11-16: procedimiento para montar los videojuegos (TA-28, ARK-234)
- [montaje de los videojuegos](../01-negocio/montaje-de-videojuegos.md): documento nuevo para la administradora. Explica cómo se recibe el enlace, se revisa el zip (lista y cómo reconocer el motor por los archivos), se sube y se prueba «Jugar»; incluye los mensajes para los equipos, la prueba de los 6 juegos con zip en producción (los 6 abren en Chrome, Edge y Firefox) y la prueba del procedimiento en Arkad-test. Producción acepta 100 MB hasta el despliegue del 24-nov, cuando HU-40 pasa a `main` con el resto del sprint (decisión de la Scrum Master del 16-nov); los zips de más de 100 MB se suben después de esa fecha.
- [juegos web por motor](../01-negocio/juegos-web-por-motor.md): «Instrucciones para los equipos» pasa de borrador a texto para el instructivo TA-23. Cambios: entrega por enlace de OneDrive o Drive, 200 MB como máximo (ideal 50 MB o menos), solo en computador, Godot con hilos y Unity con Brotli sin fallback no soportados, y Pygame cuando esté F1.
- [equipos y verificación](../01-negocio/equipos-y-verificacion.md): el zip pasa a 200 MB (HU-40) y se enlaza el procedimiento.
- [README](../README.md): el mapa de `01-negocio` menciona los dos documentos de juegos.

## 2026-11-17: búsqueda sin tildes en check-in, Pendientes y Calificados (BG-60, ARK-260)
- `GET /juror-checkin/search`, `GET /pending-games/search` y `GET /graded-games/search` ignoran tildes y mayúsculas («oscar» encuentra a Óscar, «operacion» a «Operación Segura»). Pendientes y Calificados buscan también por código de equipo («202» o «N2-AYP-202»), además de juego, equipo, integrantes, NRC y materia (código y nombre). La forma de las respuestas, el orden y los límites (20 y 100) no cambian; `search/quick` no se toca.
- Se filtra en memoria con `src/common/utils/search-text.ts` (`normalizeSearchText`, `matchesAllWords`) y `src/pending-games/videogame-search.ts`, sin la extensión `unaccent` ni migraciones. [endpoints](../02-backend/endpoints.md) no describe los campos de búsqueda, así que no cambia.

## 2026-11-17: /nrcs sin la contraseña del profesor (BG-46, ARK-236)
- `GET /nrcs`, `GET /nrcs/:id`, `POST /nrcs` y `PATCH /nrcs/:id` devolvían el usuario `professor` completo, con `password` (hash bcrypt). Ahora traen solo `id`, `firstName`, `lastName` y `email` (constante `NRC_PROFESSOR_SELECT` en `src/nrcs/nrcs.service.ts`). El front sigue mostrando el nombre del profesor. Sin cambios de rutas, permisos ni migraciones.
- Pruebas: `nrcs.service.spec.ts` (las cuatro operaciones usan el select) y `nrcs.edition.db.spec.ts` (con un profesor con contraseña, ninguna respuesta trae `password`).

## 2026-11-16: zip de 200 MB y «Jugar» en juegos históricos (HU-40, ARK-226)
- [juegos web por motor](../01-negocio/juegos-web-por-motor.md): el back acepta zips de hasta 200 MB (antes 100 MB) y responde 413 «El archivo supera el máximo de 200 MB.». «Decisiones pendientes» pasa a «Decisiones» con lo que Allison decidió el 15 y 16-nov (200 MB, solo computador, F1–F8 en HU-40, I1 hecho, sin hilos). Sección nueva sobre los juegos de ediciones pasadas. Las instrucciones para los equipos se actualizan en TA-28 (ARK-234).
- [endpoints](../02-backend/endpoints.md): `GET /historicals/videogames/:historicalVideogameId/game-file`, pública, con la misma forma que `GET /videogames/:id` (`gameFileURL` firmada por 1 h y `entry`; vacíos si no hay zip; 404 si no existe).
- [inventario-de-rutas](../02-backend/inventario-de-rutas.md): se agrega a mano la ruta nueva y el texto de `POST /upload/zip` pasa a 200 MB; el resto sigue siendo la foto de `origin/main`.
- Contrato para el front en `docs/frontend/HU-40-jugar-juegos.md` (Camilo, ARK-225).

## 2026-11-16: juegos destacados de cualquier edición (HU-41, ARK-229)
- [endpoints](../02-backend/endpoints.md): `GET /highlighted-games?editionId=` pública (en vivo e históricos, con `play` y `hasGameFile`), `POST /editions/:editionId/highlighted-games` acepta `historicalVideogameId` (409 si ya está destacado) y `DELETE /editions/:editionId/highlighted-games/historical/:historicalVideogameId`. `GET /editions/:editionId/highlighted-games` sigue igual y solo devuelve juegos en vivo.
- [modelo-de-datos](../02-backend/modelo-de-datos.md): `juego_destacado` con `id_videojuego` opcional, `id_videojuego_historico` nuevo y el CHECK «exactamente uno» (migración `20261118000000_add_historical_highlighted_games`, solo agrega columnas y restricciones).
- [inventario-de-rutas](../02-backend/inventario-de-rutas.md): se agregan a mano las dos rutas nuevas (`PublicHighlightedGamesController` y el `DELETE historical/...`); el resto sigue siendo la foto de `origin/main`.

## 2026-11-15: contingencia con suplentes (HU-14, ARK-213)
- Contrato para el front en `docs/frontend/HU-14-contingencia-suplentes.md` (ARK-214): `GET /juror/contingency/groups-at-risk`, `GET suggestions`, `POST suggestions/accept`, `POST suggestions/reject` y `GET/PUT settings`, con ejemplos, códigos de error y qué cuenta como presente, tardío y retirado. Pide que el front envíe siempre los `substituteIds` que mostró al rechazar.
- `prisma/schema.prisma`: el modelo `SubstituteSuggestionRejection` (#292) quedó entre el comentario `///` de `FairSchedule` y su modelo; se mueve antes para que el comentario vuelva a documentar a `FairSchedule`. Solo comentarios: no cambia la base de datos.

## 2026-11-15: juegos web por motor (SP-03, ARK-38)
- [juegos web por motor](../01-negocio/juegos-web-por-motor.md): documento nuevo con la tabla de resultados por motor y navegador, R1–R6, instrucciones para los equipos (instructivo TA-23), mensajes de error de la subida, correcciones F1–F8, B1–B4, I1 y T1, y el límite de 100 MB.
- [equipos y verificación](../01-negocio/equipos-y-verificacion.md), [deuda técnica del front](../03-frontend/deuda-tecnica.md) (las cabeceras de Vite solo aplican en desarrollo) y [backlog](../05-scrum-y-proceso/backlog-y-epicas.md) enlazan el documento.
- Después del merge de #293: el documento aclara que SP-03 es un spike de investigación. Las correcciones pasan a «recomendadas» con área sugerida y estado «Por decidir», el límite de 100 MB queda como recomendación y hay una sección nueva «Decisiones pendientes (Scrum Master)». Agrega que en un iPhone real el audio no suena.

## 2026-11-15: alta del jurado de último momento (HU-24, ARK-217)
- [jurados](../01-negocio/jurados.md#jurado-de-último-momento-hu-24): sección nueva con quién lo hace, los valores fijos (Junior y Suplente), la llegada y qué pasa con el correo repetido y los nombres parecidos.
- [endpoints](../02-backend/endpoints.md): prefijo `/walk-in-jurors` (`POST /`, `GET :jurorId/team-suggestion`, `POST :jurorId/assignments`). [modelo-de-datos](../02-backend/modelo-de-datos.md): columna `jurado_edicion.alta_dia_feria`. [estructura](../02-backend/estructura-objetivo-y-convenciones.md): módulo `walk-in-juror` en `src/jurors/`.
- Botón «Asignar grupos automáticamente»: [jurados](../01-negocio/jurados.md#jurado-de-último-momento-hu-24) explica la regla (un solo nivel, el de más faltantes; tope 3; asignados antes de las 11:00 y presentes después) y [endpoints](../02-backend/endpoints.md) las rutas `team-suggestion` y `assignments`.

## 2026-11-14: pruebas e2e (TA-06, ARK-42), integración en serie (TA-24, ARK-208) y borradores con reloj desfasado
- [pruebas](../02-backend/pruebas.md): lista real de las 15 e2e y los 29 `*.db.spec.ts`, por qué corren en serie (`maxWorkers: 1`, `npm run test:db`), y estado de TA-24 y TA-06 (Hecho) y TA-11 (por hacer). Igual en la copia del front.
- [pruebas-y-verificacion](../04-devops/pruebas-y-verificacion.md): fila nueva de las e2e del front (Playwright contra Arkad-test, workflow `E2E-Arkad-test`) y el CI del back con `test:e2e` / `test:db`.
- Front: `estado-auth-y-sockets` explica que el respaldo local de un borrador se decide por versión (`baseVersion`) y no por la hora del navegador (front #310). `e2e/README.md` del front: cómo leer el resultado de una corrida y descargar el informe, con capturas.

## 2026-11-14: suplentes en lote (HU-09, ARK-215)
- [jurados](../01-negocio/jurados.md#suplentes-en-lote-hu-09): sección nueva. Se suma sin quitar grupos, se omiten los pares que ya existen, solo suplentes confirmados de la edición, reglas de HU-08 sobre todos los pares, una transacción con bitácora y un aviso de HU-22 por suplente.
- [reglas-de-negocio §5](../01-negocio/reglas-de-negocio.md#5-asignación-de-jurados): filas «Jurados por grupo» (más de 3 es válido) y «Suplentes».
- [endpoints](../02-backend/endpoints.md): `POST /juror/assignments/substitutes/bulk` (servicio `AssignJurors`, sin permisos nuevos ni migración). [arquitectura-modulos](../02-backend/arquitectura-modulos.md): subcarpeta `src/jurors/juror/substitute-assignment/`.
- Contrato para el front en `docs/frontend/HU-09-suplentes-en-lote.md` (ARK-216). [inventario-de-rutas](../02-backend/inventario-de-rutas.md) no se regenera: es la foto de `origin/main`.

## 2026-11-13: reorganización de carpetas aplicada (TA-15, ARK-51)
- Los documentos que citaban rutas o nombres viejos apuntan a la estructura nueva (`src/jurors/` en el back, `src/features/<dominio>/` en el front): [estructura-del-proyecto](../03-frontend/estructura-del-proyecto.md) (árbol reescrito), [consumo-de-api](../03-frontend/consumo-de-api.md), [arquitectura-modulos](../02-backend/arquitectura-modulos.md), [endpoints](../02-backend/endpoints.md) (`members` ya no existe), [integraciones](../02-backend/integraciones.md), [riesgos-y-deuda](../04-devops/riesgos-y-deuda.md), [inventario-de-rutas](../02-backend/inventario-de-rutas.md) (sección `PendingGamesController`) y el resto de `03-frontend/`.
- [Mapa de movimientos](mapa-de-movimientos-ark-51.md): estado «ejecutado» con los PR de cada bloque. Los diagnósticos y las convenciones no se tocan (son el «antes» y la regla).

## 2026-11-13: estructura objetivo y convenciones (TA-14, ARK-50)
- Nuevos: [estructura objetivo y convenciones del backend](../02-backend/estructura-objetivo-y-convenciones.md) (módulo por dominio, `src/jurors/`, nombres y capas), [del frontend](../03-frontend/estructura-objetivo-y-convenciones.md) (`src/features/<dominio>/`) y el [mapa de movimientos para TA-15](mapa-de-movimientos-ark-51.md). Propuesta a validar con el equipo y el profesor el 17-nov.
- Guías de contribución de back y front, [arquitectura-modulos](../02-backend/arquitectura-modulos.md), [estructura-del-proyecto](../03-frontend/estructura-del-proyecto.md), índices y [checklist de traspaso](../05-scrum-y-proceso/checklist-traspaso-v5.md) enlazan a las convenciones.
- Corregido el H4 del [diagnóstico del back](../02-backend/diagnostico-estructura.md): `members/dto/update-member.dto.ts` sigue en uso.
- Decisiones del equipo (13-nov) y ensayo local de TA-15 sin regresiones: se borra `members`; el símbolo principal se llama como su archivo (40 renombres); lo genérico queda en compartido y lo común a subdominios de `jurors` va a `features/jurors/<tipo>/`; imports entre módulos hermanos de `src/jurors/` con `src/`; regla de ubicación del front sin contradicción. El [mapa de movimientos](mapa-de-movimientos-ark-51.md) suma los archivos que entraron con #298 y #299 y corrige destinos y conteos.

## 2026-11-13: aviso al suplente al asignarle grupos (HU-22, ARK-84)
- [jurados](../01-negocio/jurados.md#aviso-al-suplente-hu-22): sección nueva con quién recibe el aviso, el correo por ACS sin datos de otras personas y qué pasa si falla.
- [endpoints](../02-backend/endpoints.md): prefijo `/substitute-notices` (`GET me`, `PATCH :id/read`, `GET unread`). [modelo-de-datos](../02-backend/modelo-de-datos.md): tablas `aviso_suplente` y `aviso_suplente_equipo`.
- Contrato para el front en `docs/frontend/HU-22-aviso-suplente.md` (consulta cada 10 s; el «Entendido» lo guarda el front). [inventario-de-rutas](../02-backend/inventario-de-rutas.md) no se regenera: es la foto de `origin/main`.

## 2026-11-13: diagnóstico de la estructura de los repos (TA-13, ARK-49)
- Nuevos: [diagnóstico del backend](../02-backend/diagnostico-estructura.md) y [diagnóstico del frontend](../03-frontend/diagnostico-estructura.md), medidos sobre `origin/dev` (`a564190`) y `origin/dev-deploy` (`10b4bd7f`), con hallazgos priorizados para TA-14 (ARK-50).
- [estructura-del-proyecto](../03-frontend/estructura-del-proyecto.md) y [deuda-tecnica](../03-frontend/deuda-tecnica.md) del front apuntan al diagnóstico para las cifras de tamaño; se corrige qué contiene `grupo 11`. Índices de [02-backend](../02-backend/README.md) y [03-frontend](../03-frontend/README.md).
- **Pendiente aparte:** las dos copias de `docs/arkad/` (back y front) difieren en 13 archivos desde antes de este cambio; reconciliarlas no es parte de TA-13.

## 2026-11-11: TA-25 (ARK-211)
- Sprint 3 pasa a 157 pts con TA-25 (cambio manual del rol de un profesor de Jurado a Profesor en producción, Santiago). Actualizados [estado-actual](../00-inicio-rapido/estado-actual.md) y [sprints-historial](../05-scrum-y-proceso/sprints-historial.md).

## 2026-11-10: hallazgos de Juan (ARK-158, ARK-188, ARK-194) y decisiones de Allison
- **Presentador externo:** puede ser persona sin equipo (HU-33) o equipo no calificable (HU-39, ARK-207). Certificado solo por correo enviado por el administrador; nadie lo descarga. Actualizados [glosario](glosario.md), [roles-y-permisos](../01-negocio/roles-y-permisos.md) y [reglas-de-negocio](../01-negocio/reglas-de-negocio.md).
- **Equipo rechazado (BG-43, ARK-205):** sin nota final ni ranking, evaluaciones conservadas. Actualizado [reglas-de-negocio](../01-negocio/reglas-de-negocio.md).
- Sprint 3 pasa a 156 pts con BG-43, BG-44 (ARK-206), HU-39 y TA-24 (ARK-208): [estado-actual](../00-inicio-rapido/estado-actual.md) y [sprints-historial](../05-scrum-y-proceso/sprints-historial.md). Claves nuevas en [backlog-y-epicas](../05-scrum-y-proceso/backlog-y-epicas.md).

## 2026-11-10: limpieza de variables, secretos y código muerto (TA-18, ARK-175)
- [riesgos-y-deuda](../04-devops/riesgos-y-deuda.md), [pipeline-y-despliegue](../04-devops/pipeline-y-despliegue.md), [runbook-incidentes](../04-devops/runbook-incidentes.md) y [checklist-traspaso-v5](../05-scrum-y-proceso/checklist-traspaso-v5.md): los `main.yml` legados de los receptores están deshabilitados (falta eliminarlos); el receptor del back es `openlabun/Arkad-Api` (antes «repo openlab»); dependencias retiradas y secretos de GitHub borrados.
- [variables-y-accesos](../04-devops/variables-y-accesos.md) e [integraciones](../02-backend/integraciones.md): secretos que quedan en `Arkad-Api` y retiro de `AZURE_BLOB_SAS_URL` del `.env` de test y prod.
- [endpoints](../02-backend/endpoints.md) y [arquitectura-modulos](../02-backend/arquitectura-modulos.md): `/teams/:teamId/members` no existe en la API (`MembersModule` no está montado).

## 2026-11-08: NRC por materia (HU-31, ARK-167)
- [equipos-y-verificacion](../01-negocio/equipos-y-verificacion.md#inscripción-registro-de-equipo): regla de un NRC por materia, de la edición del equipo, con varias materias por integrante, y los datos nuevos de `GET /nrcs/select-options`.

## 2026-11-07: qué puede editar el estudiante (BG-38, ARK-161)
- Nueva sección en [equipos-y-verificacion](../01-negocio/equipos-y-verificacion.md#qué-puede-editar-el-estudiante-bg-38) con la tabla de SP-05 aprobada por Allison; nota en `roles-y-permisos`.
- `inventario-de-rutas`: notas de `PATCH /teams/:id`, rutas de integrantes, `PATCH /students/members/:memberId/nrcs` y `PATCH /videogames/:id`.

## 2026-11-07: BG-36, notas del Excel del profesor con 2 decimales
- `reglas-de-negocio` (§7): el Excel del panel del profesor guarda las notas como números con formato `0.00` (`src/professors/excel-export.service.ts`, `gradeCellValue` y `GRADE_NUM_FMT`).

## 2026-11-07: BG-40, Excel de asignación solo con jurados de la edición
- `jurados` (Jurados por edición): `exportJurados` usa `jurorsOfEdition`; Estado y Tipo salen de la edición (`src/reports/reports.service.ts`, `getJurorAssignmentReport`).

## 2026-11-07: decisiones de la reunión con profesores (6-nov) y aclaración de externos
- **P-02 cerrada:** 60 % el promedio de los profesores que calificaron al grupo, 40 % el promedio de los jurados junior (HU-34); la nota incompleta queda en «Nota en proceso». Actualizados `glosario`, `reglas-de-negocio`, `decisiones-abiertas`, `que-es-arkad`, `evaluacion-y-ranking`, `estado-actual` y `calendario-feria`.
- **Tres tipos de participante** aclarados en `glosario`, `reglas-de-negocio` y `roles-y-permisos`: equipo normal, colegio (N0, externo, sí se califica solo con seniors) y **presentador externo** (rol nuevo HU-33: lo registra solo el administrador y nunca se califica). La nota de los colegios (promedio de seniors al 100 %) es una propuesta del 7-nov a confirmar con los profesores.
- Decididos por Allison el 7-nov: **rangos de las etiquetas de nota** (BG-32: Excelente 4.50–5.00, Muy bueno 4.00–4.49, Bueno 3.50–3.99, Aceptable 3.00–3.49, Insuficiente 0.00–2.99) y **podio propio para los equipos externos** (HU-38, ARK-204, por confirmar con el profesor). Actualizados `reglas-de-negocio`, `decisiones-abiertas`, `glosario` y `estado-actual`.
- Sprint 3 armado en Jira (142 pts, id 8): `sprints-historial`, `backlog-y-epicas` y `estado-actual`.
- Publicada la actualización en `docs/arkad/` de los repos de backend (a `dev`) y frontend (a `dev-deploy`) por PR, sin `07-`, `08-` ni `entrega-documentacion-ARK-48`. **Pendiente:** `sprints-historial` sigue sin velocidad ni retrospectiva del Sprint 2, y sus estados de Jira por ticket son del 5-nov.

## 2026-11-06: publicación en los repos (Sprint 3) y cierre de BG-14
- La carpeta se publica en `docs/arkad/` de los repos de backend y frontend (mismo contenido en ambos). **No se publican** las carpetas de accesos y credenciales ni las fuentes originales, ni la entrega original de DevOps (`entrega-documentacion-ARK-48`, que trae correos reales de pruebas); los enlaces a esos documentos se quitaron y las referencias dicen «fuera del repo».
- README del frontend reescrito (era la plantilla de Vite) y sección de documentación en el README del backend.
- **BG-14 (ARK-119):** revisada la investigación de Rafael. Causa: dato mal guardado (ya corregido en test) y zona horaria del navegador en el front. Se anota en [ediciones](../01-negocio/ediciones.md#horas-de-las-ediciones-y-zona-horaria), [deuda técnica del front](../03-frontend/deuda-tecnica.md), [backlog](../05-scrum-y-proceso/backlog-y-epicas.md), [sprints](../05-scrum-y-proceso/sprints-historial.md) y [estado actual](../00-inicio-rapido/estado-actual.md). ARK-119 pasó a «Hecho» y el arreglo del front quedó en BG-34 (ARK-157).
- Las demás pendientes de la lista de abajo siguen abiertas.

## 2026-11-05: primera versión completa de la estructura (ticket de documentación, Sprint 2)

| Área | Archivos | Estado |
|---|---|---|
| Raíz | `README.md` | completo |
| 00-inicio-rapido | `que-es-arkad`, `arquitectura-general`, `onboarding-por-rol` | completo |
| 00-inicio-rapido | `estado-actual` | parcial (foto al 5-nov; actualizar al cierre del turno) |
| 01-negocio | `reglas-de-negocio`, `jurados`, `ediciones`, `decisiones-abiertas` | completo según el backlog (P-02 abierta) |
| 01-negocio | `roles-y-permisos`, `equipos-y-verificacion` | completo (2.ª pasada: flujo de registro, verificación y permisos con el inventario) |
| 02-backend | `README`, `auth-y-sesiones`, `cache-y-throttling`, `modelo-de-datos`, `migraciones-y-seed`, `guia-de-contribucion` | completo (leído del código) |
| 02-backend | `arquitectura-modulos`, `endpoints`, `evaluacion-y-ranking`, `integraciones`, `pruebas`, `inventario-de-rutas` | completo contrastado con `origin/main` (2.ª pasada); falta el detalle de excepciones por servicio |
| 03-frontend | `rutas-y-pantallas`, `README`, `guia-de-contribucion` | completo (leído de `origin/main`) |
| 03-frontend | `estructura-del-proyecto`, `estado-auth-y-sockets`, `consumo-de-api`, `deuda-tecnica` | completo en lo verificable (2.ª pasada: sockets, `fetch` directo y pantallas grandes); no se leyó cada componente |
| 04-devops | `README`, `pipeline-y-despliegue`, `variables-y-accesos`, `runbook-promocion-a-produccion`, `riesgos-y-deuda`, `flujo-fullstack-y-ramas` | completo (según Santiago) |
| 04-devops | `runbook-incidentes`, `base-de-datos-operacion`, `docker-y-builds`, `pruebas-y-verificacion` | completo salvo el `docker run` exacto de los receptores (necesita acceso a los repos openlab) |
| 05-scrum-y-proceso | `jira-y-flujo-de-trabajo`, `roles-y-revisiones`, `calendario-feria`, `checklist-traspaso-v5` | completo / se completa al cierre |
| 05-scrum-y-proceso | `sprints-historial`, `backlog-y-epicas` | completo salvo velocidad y retrospectiva (tabla de Jira y resultados por tickets al 5-nov) |
| 06-referencia | `glosario`, `mapa-de-fuentes`, `changelog-documentacion` | completo |

**Notas de método**
- Backend leído de `repo back` en la rama local `fix/ARK-128-team-code-per-edition` (`b075066`, 59 migraciones; producción tiene 61). Frontend leído de `origin/main` (`5b70d2e`) con `git show`; la copia local del front es de mayo y no sirve.
- Se encontró y corrigió que el front **sí** tiene pruebas Vitest y que `Test-front` ya no es un placeholder.
- No se copió `NOTAS_PERSONALES_ALLISON.md`.
- Verificación: 211 enlaces relativos revisados (0 rotos) y búsqueda de IPs, llaves y contraseñas fuera de las carpetas 07 y 08 (0 hallazgos).

## 2026-11-05 (segunda pasada): pendientes resueltos
- **Jira:** tabla ticket → estado en [backlog-y-epicas](../05-scrum-y-proceso/backlog-y-epicas.md) y resultados por tickets de los sprints 1 y 2 en [sprints-historial](../05-scrum-y-proceso/sprints-historial.md). Corrige que HU-07, HU-08, HU-11 y HU-25 ya están «Hecho».
- **Backend contrastado con producción (`origin/main` `bcfe237`):** nuevo [inventario-de-rutas](../02-backend/inventario-de-rutas.md) (203 rutas, 0 sin decidir); módulos nuevos documentados en `arquitectura-modulos` y `endpoints`; `finalize` del ranking, integraciones (comportamiento ante fallos), caché y tiempos de token en sus archivos.
- **Pruebas ejecutadas:** `npm run test:ci` sobre `origin/main`: 1313 pasan, 77 omitidas, 0 fallan ([pruebas](../02-backend/pruebas.md)).
- **Frontend:** `fetch` directo (solo 2 usos), sockets (solo likes) y pantallas más grandes (`JuradosAssignment` ~1960 líneas).
- **Negocio:** flujo de registro de equipos y código de verificación; estado de permisos con el inventario. Se corrigió que el SAS de lectura dura **3 años** por defecto (no 3600 s).
- **Operación:** plan de contingencia técnico propuesto en [calendario-feria](../05-scrum-y-proceso/calendario-feria.md); cómo ejecutar los scripts de `verificacion/`.

## Pendiente para cerrar la documentación (lo que no se puede resolver sin una persona o un acceso)
1. **Comando exacto de `docker run` de los receptores:** está en repos que la cuenta `Ally2403` no puede ver (`openlabun/Arkad-Front` y el repo openlab del back). Lo completa quien tenga acceso ([docker-y-builds](../04-devops/docker-y-builds.md)).
2. **Velocidad en puntos y retrospectiva** de los sprints 1 y 2 (Scrum Master, al cerrar el 6-nov).
3. **P-02** (ponderación definitiva) y las demás decisiones abiertas con los profesores (6-nov).
4. **Fechas de vencimiento** (secreto de Entra ID, dueños de consolas) y **contacto técnico de guardia** del 26-nov.
5. Ensayar la contingencia técnica en el ensayo del 25-nov y ajustar la tabla.
6. Revisar con ojo humano las 48 rutas públicas del inventario.
7. Resultado de la feria del 26-nov y traspaso a V5; actualizar `estado-actual` al cierre del turno.
8. Detalle por servicio de lo que lanza cada excepción (no documentado servicio por servicio).
