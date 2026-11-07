# Glosario

> **Actualizado:** 2026-11-05 · **Estado:** completo · **Fuente:** backlog §2.2 y §2.1

| Término | Significado |
|---|---|
| **ARKAD** | Plataforma web de la feria de videojuegos de Uninorte |
| **Feria / Edición** | Versión anual de ARKAD. Estados: activa, inactiva, archivada. La edición activa es la de trabajo |
| **Edición de trabajo** | La edición `ACTIVE`; la decide el servidor |
| **Semestre de la edición** | 10 primer semestre, 20 intersemestral, 30 segundo |
| **Nivel (N0–N4)** | Primer número del código del equipo (`N1-AYP-06`). N1–N4 asignaturas de menor a mayor; **N0 = colegios invitados** |
| **Colegio invitado** | Equipo de un colegio (N0). Solo lo califican jurados senior (profesores) y no tiene código de verificación |
| **Equipo externo** | Marca del equipo independiente del nivel: en la nota solo cuenta la nota junior. No es lo mismo que colegio |
| **NRC** | Código de un curso o sección; tiene grupos participantes y un profesor, por edición |
| **Profesor** | Rol Profesor; sube notas por NRC y califica (su nota cuenta como senior) |
| **Jurado** | Rol Jurado; califica en la feria. Puede ser un profesor sin NRC |
| **Junior / Senior** | Categoría del jurado. **Senior = solo profesores**; el resto es junior. Cambia el peso de la nota y el acceso a colegios |
| **Oficial / Suplente (`BACKUP`)** | Tipo del jurado. Suplente (antes «remanente»): reserva que cubre a quien no llega; sus grupos se **suman**, nadie pierde los suyos |
| **Staff** | Rol de la mesa de escarapelas; escanea QR, no califica |
| **Escarapela** | Credencial del jurado con QR (por edición) |
| **Check-in** | Registro de llegada del jurado por QR o buscándolo por nombre |
| **Evaluación que cuenta** | De todas las que recibe un grupo, solo las 3 primeras (por hora de envío) entran al promedio |
| **Código de verificación** | Código del equipo (panel del estudiante) que el jurado digita para calificar ese grupo; N0 no lo tiene |
| **Hora de alerta / de control** | 10:00 aviso informativo de jurados ausentes; 11:00 control definitivo y suplentes |
| **Desempate** | Regla para ordenar el ranking con la misma nota (mismo profesor decide; si no, gana la inscripción más antigua) |
| **Podio** | Los 3 primeros de cada nivel (configurable) |
| **Ponderación** | Porcentajes junior/senior por edición (`Weighting`); la definitiva está abierta (P-02) |
| **Histórico** | Datos de ediciones archivadas en tablas `*_historico` |
| **`dev` / `dev-deploy`** | Ramas de integración (test) del back / del front; `main` = producción |
| **`Arkad-test`** | Ambiente de pruebas |
| **ARK-n** | Clave de Jira; `HU` historia, `BG` bug, `TA` tarea, `SP` spike son los códigos del backlog |
| **DoD** | Definition of Done ([jira-y-flujo](../05-scrum-y-proceso/jira-y-flujo-de-trabajo.md)) |
| **PAT / `DEPLOY_PAT`** | Token de GitHub que dispara los despliegues entre repos |
| **Receptor** | Repo que recibe el evento de imagen publicada y despliega por SSH |
| **Gotenberg** | Servicio que genera PDF (certificados y escarapelas) |
| **ACS** | Azure Communication Services (correo) |
| **Entra ID** | Login con Microsoft |
| **BG-xx, HU-xx, TA-xx, SP-xx, P-xx** | Códigos del backlog (ver [backlog](../05-scrum-y-proceso/backlog-y-epicas.md) y [decisiones](../01-negocio/decisiones-abiertas.md)) |
