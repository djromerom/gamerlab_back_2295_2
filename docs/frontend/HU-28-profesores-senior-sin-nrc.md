# Contrato de API · HU-28 · Profesores senior sin NRC en «Jurados de la edición»

**Para:** Jorge Silva (Frontend) · **De:** Samuel Tilano (Backend)
**Ticket:** ARK-141 (historia) · ARK-150 (backend) · ARK-151 (frontend) · **Rama backend:** `feat/ARK-150-enroll-senior-professors` · **Estado:** en revisión (PR a `dev`)
Swagger local: `http://localhost:3000/api` (sección *Juror edition*)

Este contrato **extiende** el de HU-25 (`docs/frontend/HU-25-jurados-por-edicion.md`). Las rutas, los tipos y los permisos son los mismos; solo cambia **a quién** acepta la inscripción por correo y qué significan dos errores.

## Qué hace
Hasta ahora un profesor era jurado de una edición **solo** si tenía un NRC activo en ella (automático). Los profesores senior que **no tienen NRC** en la edición pero vienen a calificar no tenían cómo entrar: `POST /juror-edition/enroll` los rechazaba con 400.

Con HU-28:
- El administrador escribe el correo de un **profesor sin NRC activo en la edición** en el mismo campo de «Inscribir por correo» y queda inscrito **Confirmado**, como cualquier jurado externo.
- Sale en la lista como `source: 'ENROLLED'`, `category: 'Senior'` (todo profesor es senior, P-07) y con su `type` (Oficial por defecto) y `status`.
- Desde ese momento cuenta como jurado de la edición en todo el sistema: asignación automática y manual, escarapelas y check-in. El frontend no tiene que hacer nada más.
- Se confirma, declina o cambia de tipo con `PATCH /juror-edition/status`, igual que un jurado externo.
- «Traer de la edición anterior» también trae, como Pendientes, a los profesores que estaban inscritos y confirmados en la anterior.
- Un profesor **con** NRC activo en la edición sigue siendo automático y no se puede inscribir (409).

## Roles y permisos
Sin cambios: `ListEditionJurors` y `ManageEditionJurors`, **solo Administrador**. Cualquier otro rol recibe **403**.

## Reglas generales
Las mismas de HU-25: cookie `access-token`, errores con el formato de Nest, `editionId` opcional (por defecto la activa), ediciones de solo lectura → 400.

## Tipos (TypeScript)
No cambian. Solo cambian dos comentarios:
```ts
// ENROLLED: tiene fila en la edición: jurado externo o, desde HU-28, profesor sin NRC.
// PROFESSOR_NRC: profesor con NRC activo en la edición (automático, no editable).
type JurorEditionSource = 'ENROLLED' | 'PROFESSOR_NRC';

// NOT_ENROLLED: no tiene fila en la edición (un profesor sin NRC se inscribe por correo).
// IS_PROFESSOR: profesor automático (NRC activo en la edición); no se confirma ni declina.
type StatusRowError = 'NOT_ENROLLED' | 'IS_PROFESSOR';
```
Para saber si una fila `ENROLLED` es un profesor, usar `category === 'Senior'` no basta (hay jurados externos senior); si la UI necesita distinguirlos, ver «Por confirmar».

## Rutas

### 1. Inscribir por correo — `POST /juror-edition/enroll` (cambia)
Body sin cambios:
```json
{ "email": "carlos.ruiz@uninorte.edu.co", "editionId": 5, "type": "OFFICIAL" }
```
- `type` opcional; por defecto `OFFICIAL`.

```json
// 201 (profesor sin NRC)
{
  "jurorId": "9a2b0c1d-...", "firstName": "Carlos", "lastName": "Ruiz", "email": "carlos.ruiz@uninorte.edu.co",
  "category": "Senior", "type": "OFFICIAL", "status": "CONFIRMED", "source": "ENROLLED",
  "updatedAt": "2026-11-05T14:00:00.000Z"
}
```

| Código | Cuándo | Qué mostrar |
|---|---|---|
| 201 | Inscrito y confirmado (jurado externo **o profesor sin NRC**) | Éxito + agregarlo a la tabla |
| 400 | Correo inválido, la cuenta **no es de rol Jurado ni Profesor** (Estudiante, Staff…) o edición de solo lectura | El `message` |
| 404 | No hay cuenta activa con ese correo | Igual que hoy: botón al alta de jurado (Personal → Jurados) |
| 409 | Ya está en la edición | El `message` ("El jurado ya está en esta edición como <estado>") |
| 409 **(nuevo)** | Es un profesor con NRC activo en la edición | El `message`: "El profesor ya es jurado de esta edición porque tiene un NRC activo en ella" |

**Eliminado:** el 400 "Los profesores no se inscriben: son jurados de la edición si tienen un NRC activo en ella". Si la UI tenía un texto o una validación propia para profesores, quitarla.

### 2. Listar — `GET /juror-edition` (misma forma)
Ahora incluye a los profesores inscritos: `source: 'ENROLLED'`, `category: 'Senior'`, con `type` y `status` de su fila, y cuentan en `counts` (Pendiente/Confirmado/Declinó). Si un profesor inscrito recibe después un NRC en la edición, sale **una sola vez**, como `AUTOMATIC` / `PROFESSOR_NRC`.

### 3. Confirmar, declinar o cambiar tipo — `PATCH /juror-edition/status` (misma forma)
- El profesor inscrito se edita como cualquier fila (`ok: true`).
- `IS_PROFESSOR` ahora significa solo **profesor automático** (con NRC activo en la edición).
- Un profesor sin NRC que **no** está inscrito responde `NOT_ENROLLED` (antes respondía `IS_PROFESSOR`).

| Error por fila | Qué mostrar |
|---|---|
| `NOT_ENROLLED` | "No está en esta edición" (si es profesor, se inscribe por correo) |
| `IS_PROFESSOR` | "Profesor con NRC en la edición: es jurado automático" |

### 4. Traer de la edición anterior — `POST /juror-edition/import-previous` (RETIRADO en HU-49 / ARK-280, ahora responde 404)
`created` y `skipped` ahora cuentan también a los profesores inscritos y confirmados en la anterior. Si la anterior no tenía lista (*fallback*), sigue trayendo solo cuentas de rol Jurado.

## Notas de UI
- El campo «Inscribir por correo» acepta ahora correos de profesores: ajustar el texto de ayuda, por ejemplo "Correo de un jurado o de un profesor senior sin NRC en esta edición".
- La fila del profesor inscrito tiene las mismas acciones que la de un jurado (confirmar, declinar, Oficial/Suplente); la del profesor automático sigue sin acciones.

## Por confirmar con Frontend
1. ¿La tabla necesita distinguir al profesor inscrito del jurado externo (por ejemplo, una etiqueta «Profesor»)? Hoy ambos son `source: 'ENROLLED'`; si hace falta, el backend puede agregar `isProfessor: boolean` sin romper nada.
2. ¿El 409 nuevo se muestra igual que el otro 409 o con un enlace a la fila del profesor automático?

## Cómo probar en local
1. `docker compose -f docker-compose.dev.yml up` y entrar como Administrador.
2. Crear (o usar) un profesor sin NRC en la edición activa y hacer `POST /juror-edition/enroll` con su correo → 201, Senior, Confirmado, Oficial.
3. `GET /juror-edition` → aparece como `ENROLLED`.
4. `POST /juror-edition/enroll` con el correo de un profesor que tiene NRC en la edición → 409.
5. Como Profesor, Jurado o Staff, cualquiera de las rutas → 403.
