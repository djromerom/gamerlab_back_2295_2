# Checklist de traspaso a la V5

> **Audiencia:** Scrum Master saliente y entrante · **Actualizado:** 2026-11-05 · **Estado:** parcial (se completa al final del turno) · **Fuente:** `variables-y-accesos.md`, backlog, DevOps

## Accesos (entrega directa, con constancia)
- [ ] Carpeta de accesos y credenciales (fuera del repo): entregar a la Scrum Master V5 (no por chat grupal) y anotar fecha y receptor.
- [ ] Admin prod y test, Gmail del proyecto, Azure (ACS, Storage, Entra ID), Docker Hub, contraseña de BD (vive en el `.env` del servidor).
- [ ] Llave SSH y credenciales del servidor (acceso humano).
- [ ] Decidir si la V5 rota la llave SSH y la contraseña admin de prod (circularon antes de ARK-43).
- [ ] Acceso de colaborador de la V5 a: `djromerom/gamerlab_back_2295_2`, `djromerom/gamerlab_front_2295_2`, `openlabun/Arkad-Api` (receptor del back) y `openlabun/Arkad-Front`; acceso a Jira (proyecto ARK) y Discord.
- [ ] Retirar accesos de integrantes V4 que ya no participen.
- [ ] El nuevo DevOps crea **su propio** `DEPLOY_PAT` y lo carga en back y front ([§5.F](../04-devops/variables-y-accesos.md)).

## Vencimientos y recordatorios
| Qué | Fecha |
|---|---|
| `DEPLOY_PAT` | vence 2026-12-19 (recordatorio 2026-12-05) |
| Secreto de cliente de Entra ID | > PENDIENTE: anotar fecha |
| Dueño de consola reCAPTCHA / App registration Entra ID / Docker Hub | > A CONFIRMAR |

## Pendientes técnicos heredados
- [ ] P0: eliminar los `main.yml` legados en los dos receptores (ya están deshabilitados desde el 2026-11-10) ([riesgos](../04-devops/riesgos-y-deuda.md)).
- [ ] Confirmar si los históricos (197/723/197) están cargados en producción.
- [ ] Cargar NRC y ponderados de la edición que corresponda.
- [x] Limpieza de variables, secretos y dependencias (TA-18 / ARK-175, 10-nov).
- [ ] TA-09 (dumps), TA-10 (tests: 6 de 119 fallan), TA-11.
- [ ] Igualar `main → dev` y `main → dev-deploy`.
- [ ] `chmod 600` del `.env` de producción.
- [x] Supabase y `VITE_MAINTENANCE_*` retirados del front (ARK-175, 10-nov).

## Producto y proceso
- [ ] Decisiones abiertas ([decisiones-abiertas](../01-negocio/decisiones-abiertas.md)): P-02, P-23, P-24, P-28, rangos de «Excelente/Bueno», histórico del profesor, equipos externos en el podio.
- [ ] Estado de Jira por ticket y sprint (Sprint 3 y 4 aún no existen en Jira a 4-nov).
- [ ] Resultado y retrospectiva de los sprints 1 a 4 ([sprints-historial](sprints-historial.md)).
- [ ] Resultado de la feria del 26-nov: lecciones, incidentes, mejoras para la V5.
- [ ] Revisar y actualizar [00-inicio-rapido/estado-actual](../00-inicio-rapido/estado-actual.md).

## Documentación
- [ ] Esta documentación al día ([changelog](../06-referencia/changelog-documentacion.md)); no versionar la carpeta de accesos y credenciales ni ninguna carpeta `keys/`.
- [ ] Re-medir la estructura de los repos con los comandos de los diagnósticos ([back](../02-backend/diagnostico-estructura.md), [front](../03-frontend/diagnostico-estructura.md)) y entregar las cifras junto con las [convenciones de estructura](../02-backend/estructura-objetivo-y-convenciones.md) vigentes.
- [ ] Mover la documentación al repositorio/espacio que decida el PO (el `00-INDICE` de Santiago menciona un repositorio compartido por centralizar).
- [ ] Reunión de traspaso con la V5: recorrer [onboarding por rol](../00-inicio-rapido/onboarding-por-rol.md).
