# Calendario de la feria y semana de despliegue

> **Audiencia:** Scrum Master, DevOps · **Actualizado:** 2026-11-05 · **Estado:** completo según plan (verificar fechas con el PO) · **Fuente:** backlog §1.1, §11, TA-16

| Fecha | Qué pasa |
|---|---|
| 2-nov → 22-nov | Inscripción de grupos (calendario informativo; el sistema no bloquea) |
| 6-nov | Reunión con profesores y demo del Sprint 2; **P-02 cerrada** (60 % profesores, 40 % jurados junior) |
| 20-nov | Fin del Sprint 4. Sin funcionalidades nuevas desde aquí |
| 22-nov | Cierran inscripciones |
| **23-nov (lunes)** | **Congelación del código.** Asignación definitiva de jurados (23 o 24) |
| **24-nov (martes)** | Despliegue a producción |
| **25-nov (miércoles)** | Ensayo general. Escarapelas impresas (solo para elegibles de la edición; no habrá en blanco) |
| **26-nov (jueves)** | **Feria**: 8:00 inicio · 10:00 alerta informativa · 11:00 control definitivo (suplentes) · ~12:00 cierre y nota final liberada por el admin |

## TA-16 (Santiago): despliegue y ensayo general
- Congelar código el 23, ejecutar la asignación definitiva, desplegar el 24, ensayo el 25, plan de contingencia.
- El ensayo debe incluir: la migración de BG-17 (con copia de producción y respaldo), el volcado de la edición 4 (TA-17) y la verificación de «evaluaciones abiertas» (BG-21).
- Usar el [runbook de promoción](../04-devops/runbook-promocion-a-produccion.md) y los puntos de [riesgos](../04-devops/riesgos-y-deuda.md).

## Prerrequisitos de producción antes de la feria
- Cargar **NRC y ponderados de la edición 5** (sin NRC nadie completa la inscripción).
- Script de limpieza de escarapelas de BG-16 (desactivar, no borrar; con `pg_dump` previo de `escarapelas_jurado` y `asistencia_jurado`; verificar que no haya llegadas en `asistencia_jurado`); lo ejecuta DevOps en producción **después** de HU-25. Orden: HU-25 en prod → cargar NRC y confirmar jurados → BG-16 → script → escarapelas el 25. **Script ejecutado en producción el 2026-11-14** (desactivó 106 escarapelas generadas el 2-nov con la regla vieja; ver [estado actual](../00-inicio-rapido/estado-actual.md#pendientes-de-producción)).
- **No correr la asignación automática en producción** hasta que HU-25 esté mezclada.
- Promover `main → dev` / `dev-deploy` (igualación) antes de la próxima promoción.
- Renovar `DEPLOY_PAT` antes del 2026-12-19 (posterior a la feria, pero no olvidar).

## Plan de contingencia del día
Lo que se hace en la feria cuando falla algo (jurado que no llega o se va, QR que no escanea, nota que no se guarda): [jurados §Flujo del día](../01-negocio/jurados.md). Sin check-in offline: si falla el QR, se busca por nombre.
## Contingencia técnica (propuesta; validar en el ensayo del 25-nov, TA-16)
Armada con lo documentado en [runbook-incidentes](../04-devops/runbook-incidentes.md), [runbook de promoción](../04-devops/runbook-promocion-a-produccion.md) y [integraciones](../02-backend/integraciones.md). **No está ensayada.**

| Falla | Efecto | Qué hacer |
|---|---|---|
| Un despliegue reciente rompe producción | Cualquier pantalla | Volver a la imagen anterior con los tags de rollback anotados al promover ([runbook de promoción](../04-devops/runbook-promocion-a-produccion.md)). **Congelar despliegues desde el 23-nov**: el día de la feria no se promueve nada |
| Cae el contenedor del back o del front | Todo | `docker ps` en el servidor; recrear con la misma imagen. Recordar que `docker restart` **no** relee el `.env` ([runbook-incidentes](../04-devops/runbook-incidentes.md)) |
| Cae la base de datos | Todo | No improvisar con la BD; restaurar desde el `pg_dump` previo a la última promoción ([base de datos](../04-devops/base-de-datos-operacion.md)). Tener el respaldo del 24-nov a mano |
| Falla el correo (Azure ACS) | No llegan confirmaciones ni certificados; **calificar y check-in siguen funcionando** | Pasar al reenvío manual después de la feria (`/email/resend-*`); no bloquea el evento |
| Falla Gotenberg | No salen PDF de escarapelas ni certificados | Generar las **escarapelas el 25-nov** (ya planeado) y descargar el PDF con anticipación; el check-in por QR no depende de Gotenberg |
| Falla Azure Blob | No cargan imágenes/juegos subidos | Afecta la galería, no la calificación |
| Falla el login con Microsoft | Solo ese método | Entrar con correo y contraseña |
| Se pierde la conexión del salón | Nadie califica ni hace check-in | No hay modo sin conexión (decidido). Plan B humano: anotar a mano y cargar después; acordar con el profesor |
| Caída del servidor compartido | Todo | Avisar al profesor administrador del servidor; tener su contacto el día de la feria |

> A CONFIRMAR: contacto de guardia técnica el 26-nov (quién responde si el servidor falla) y quién tiene SSH ese día ([checklist de traspaso](checklist-traspaso-v5.md)).
