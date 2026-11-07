# Changelog de la documentación

> Registro de qué existe y en qué estado. Actualizar en cada cambio.

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
