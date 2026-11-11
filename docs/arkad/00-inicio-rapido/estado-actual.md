# Estado actual (corte 2026-11-05)

> **Audiencia:** todos · **Actualizado:** 2026-11-05 · **Estado:** parcial (foto a la fecha; **se actualiza al cerrar el turno**) · **Fuente:** backlog §10-§11, promociones del 4 y 5-nov, Jira (vía memoria del proyecto)

## Producción
- Back en `main` = promoción #246 (`bcfe237`), front #252 (`5b70d2e`); **61 migraciones** aplicadas.
- Edición **5 (2026-S2, feria 26-nov-2026) activa**, sin equipos, NRC, evaluaciones ni ponderados (pendiente cargarlos). Edición 4 (inactiva) concentra los datos: 151 equipos, 505 integrantes, 36 NRC, 606 evaluaciones.
- Ranking y evaluaciones cerrados; inscripciones abiertas en 4 y 5 al 4-nov.
- Promociones: 2-nov, 4-nov (59 migraciones) y 5-nov (61). Ver [runbook](../04-devops/runbook-promocion-a-produccion.md).

## Hecho en V4 (según Jira y promociones, a confirmar por ticket)
- **Seguridad:** cierre de rutas sin permiso, datos personales, refresh tokens rotados, límites de intentos (BG-01, BG-02, BG-06, BG-07, HU-05/06).
- **Panel del profesor:** «Guardar todo», filtros, exportar filtrado, retiro de «Subir plantilla» (HU-01..03, TA-04).
- **Ranking por nivel con desempate** (HU-04); **código de verificación** (HU-19); **escarapelas con QR** (HU-10); **check-in** (HU-11); **seguimiento por hora** (HU-21); **exportar asignación** (HU-16).
- **Jurados:** asignación automática y validación (HU-07/08, «Hecho» en Jira), jurados por edición (HU-25).
- **Datos por edición:** BG-17, HU-26, HU-27 y BG-18..23 (ARK-128..136), promocionados el 4-nov.
- **DevOps:** documentación (ARK-48), variables y accesos (ARK-43), optimización de builds (TA-02), CI con tests (back y front), correos ACS verificados.

## Estado en Jira (consulta del 2026-11-05; tabla completa en [backlog](../05-scrum-y-proceso/backlog-y-epicas.md#estado-real-de-los-tickets-en-jira-consulta-del-2026-11-05))
- **Hechos**, entre otros: HU-07, HU-08 (asignación automática y validación), HU-11 (check-in), HU-25, HU-26/27/28/29/30, HU-04, HU-10, HU-19, HU-21, BG-01..13, BG-15..23, BG-25, BG-26, BG-28..31, TA-10 (pruebas unitarias en el pipeline).
- **En revisión:** nada de lo planeado. BG-14 (ARK-119) se cerró el 6-nov como investigación: dato mal guardado, ya corregido en test; el arreglo de zona horaria del front pasa a BG-34 (ARK-157, sin estimar).
- **Por hacer:** BG-33 (carga de jurados con límite de 100 por página), BG-27, BG-32, BG-24, HU-09, HU-12, HU-13, HU-14, HU-17, HU-18, HU-20, HU-22, HU-23, HU-24, SP-03, TA-06, TA-08, TA-09, TA-11, TA-13..15, **TA-16 (despliegue y ensayo antes de la feria)** y esta documentación (ARK-48).

> Nota: donde este documento o el resto de la carpeta diga «en curso» para HU-07/08, mandan los estados de Jira.
- **P-02 cerrada el 6-nov** (60 % profesores, 40 % jurados junior; HU-34 en el Sprint 3). Sprint 3 armado en Jira el 6-nov (`Sprint 3 Asistencia y ajustes`, 157 pts tras sumar BG-43, BG-44, HU-39 y TA-24 el 10-nov y TA-25 el 11-nov): cambios de la reunión con profesores (HU-31 a HU-37) y errores del Sprint 2 (BG-35 a BG-42).
- BG-24 (fotos de ediciones pasadas no públicas; se resuelven firmándolas).
- Podio propio para los equipos externos (HU-38, ARK-204, backlog) y rangos de las etiquetas de nota (BG-32, decididos el 7-nov).

## Pendientes de producción
Prueba de humo con admin; cargar NRC y ponderados de la edición 5; script de BG-16 para escarapelas (después de HU-25 en producción); `chmod 600` del `.env`; igualar `main → dev/dev-deploy`; confirmar históricos (197/723/197).

## Deuda técnica principal
2 **P0 de DevOps** abiertos (`main.yml` legados; credenciales expuestas en historial) · dependencias sin uso · lint no bloqueante · archivos de más de 500 líneas · TA-08/09/10/11 · Épica VII sin ejecutar. Ver [riesgos](../04-devops/riesgos-y-deuda.md) y [deuda del front](../03-frontend/deuda-tecnica.md).

## Qué NO existe todavía
Entorno de preview por rama · aprobación en producción · respaldo automático antes de migrar · check-in sin conexión (decidido que no) · UI para administrar roles y permisos · contingencia técnica del día de la feria: hay una tabla propuesta en [calendario-feria](../05-scrum-y-proceso/calendario-feria.md), pero no se ha ensayado.

> PENDIENTE: actualizar esta foto con el cierre del Sprint 2 (6-nov), los sprints siguientes y el resultado de la feria (26-nov). La parte de Jira ya está al 5-nov.
