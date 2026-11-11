# Glosario

> **Actualizado:** 2026-11-07 · **Estado:** completo · **Fuente:** backlog §2.2 y §2.1

| Término | Significado |
|---|---|
| **ARKAD** | Plataforma web de la feria de videojuegos de Uninorte |
| **Feria / Edición** | Versión anual de ARKAD. Estados: activa, inactiva, archivada. La edición activa es la de trabajo |
| **Edición de trabajo** | La edición `ACTIVE`; la decide el servidor |
| **Semestre de la edición** | 10 primer semestre, 20 intersemestral, 30 segundo |
| **Nivel (N0–N4)** | Primer número del código del equipo (`N1-AYP-06`). N1–N4 asignaturas de menor a mayor; **N0 = colegios invitados** |
| **Colegio invitado** | Equipo de un colegio (N0). Es externo a Uninorte y **sí se califica**, pero solo lo califican jurados senior (profesores) y no tiene código de verificación |
| **Equipo externo** | Marca del equipo (`isExternal`), independiente del nivel: en la nota solo cuenta la nota de jurados junior. Un colegio (N0) es un equipo externo que sí se califica, pero solo por seniors (ver [reglas de negocio](../01-negocio/reglas-de-negocio.md), sección 2) |
| **Presentador externo** | Rol nuevo (HU-33, 6-nov). Persona que va a la feria y **nunca se califica**; solo se registra para obtener el certificado, que le envía por correo el administrador (nadie descarga su propio certificado). Lo registra solo el administrador. Puede ser una **persona sin equipo** (HU-33) o un **equipo no calificable** que presenta un proyecto (HU-39, 10-nov): sale en la galería, pero no en el ranking, la asignación, el seguimiento ni las notas. No es un colegio |
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
| **Podio** | Los 3 primeros de cada nivel (configurable). Los equipos externos, según Allison (7-nov, por confirmar), tendrían un podio propio (HU-38) |
| **Etiqueta de la nota** | Texto junto a la nota final: Excelente (4.50–5.00), Muy bueno (4.00–4.49), Bueno (3.50–3.99), Aceptable (3.00–3.49), Insuficiente (0.00–2.99); BG-32 |
| **Ponderación** | Porcentajes por edición (`Weighting`). Definida el 6-nov (P-02): **60 %** promedio de los profesores que calificaron al grupo y **40 %** promedio de los jurados junior (HU-34) |
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
