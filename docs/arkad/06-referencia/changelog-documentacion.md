# Changelog de la documentación

> Registro de qué existe y en qué estado. Actualizar en cada cambio.

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
