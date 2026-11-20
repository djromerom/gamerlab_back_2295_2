# Contrato de API · HU-50 · Desactivar el código de verificación

**Para:** Frontend (Camilo, ARK-311) · **De:** Backend (ARK-314)
**Ticket:** HU-50 (ARK-310) · **Estado:** implementado y probado (pruebas unitarias; la migración la valida el job `integration` del CI).
Swagger local: `http://localhost:3000/api` (secciones *Team verification* y *Settings*)

## Qué hace
El Administrador puede desactivar el código de verificación (HU-19) de **un equipo** o de **todos los equipos de la edición activa**. En esos equipos el jurado califica sin digitar el código.

- **Regla única** (`requiresVerificationCode`): se pide el código solo si el interruptor global está encendido **y** el del equipo está encendido **y** el equipo tiene código **y** no es N0 (colegios).
- El interruptor **global manda**: si está apagado, ningún equipo pide código, aunque el suyo esté encendido. Al volver a encenderlo, los equipos con el código desactivado siguen sin pedirlo.
- Apagar o encender **no regenera códigos ni borra las verificaciones** ya hechas.
- Por defecto todo sigue exigiéndose como antes: la migración deja los equipos y la configuración existentes en `true`.

## Autenticación y errores (igual que el resto de la API)
- Sesión por cookie HttpOnly `access-token` (`credentials: 'include'`).
- **401** sin sesión · **403** sin permiso.

## Por equipo (Equipos inscritos, menú «⋮»)

### `PATCH /team-verification/:teamId/required` → 200
Permiso `ManageTeamVerificationCode` (solo Administrador).

```ts
// Cuerpo
{ required: boolean } // false = desactivar el código; true = volver a exigirlo

// Respuesta
{ teamId: number; verificationRequired: boolean; changed: boolean }
```

- `changed: false` si el equipo ya tenía ese valor (no se registra nada).
- Cada cambio queda en la bitácora del código (`TeamVerificationLog`, acciones `CODE_DISABLED` / `CODE_ENABLED`, con quién y cuándo).
- **400**: cuerpo inválido; equipo de colegios (N0), con el mensaje «Los equipos de colegios (N0) no tienen código de verificación»; o equipo no calificable (`code: "TEAM_NOT_GRADABLE"`).
- **403** si el equipo es de una edición cerrada.
- **404** si el equipo no existe o está inactivo.

### Indicador en la lista
`GET /teams` incluye `verificationRequired: boolean` en cada equipo. Como antes, a los roles que no son Administrador solo se les oculta `verificationCode`. Ojo: `verificationRequired: true` no significa que hoy se pida el código si el interruptor global está apagado.

## Para toda la edición (Configuración del evento)

### `GET /settings/verification-codes` → 200
### `PATCH /settings/verification-codes` → 200
Permiso `UpdateSettings` (solo Administrador). Siempre sobre la **edición activa**.

```ts
// Cuerpo del PATCH
{ enabled: boolean } // false = ningún equipo pide código

// Respuesta de los dos
{
  verificationCodesEnabled: boolean;
  changedAt: string | null;                       // ISO 8601; null si nunca se cambió
  changedBy: { id: string; name: string } | null;
}
```

- Si el valor no cambia, el PATCH no toca `changedAt` ni `changedBy`.
- `GET` sin configuración de la edición activa responde `verificationCodesEnabled: true`.
- **404** en el PATCH si la edición activa no tiene configuración (`code: "EVENT_CONFIGURATION_NOT_FOUND"`).

## Lo que ve el jurado (TeamVerificationGate y BatchRatePage)

### `GET /team-verification/status?teamIds=…&includeLocks=true`
Ahora devuelve además `required`:

```ts
{
  status: Record<number, boolean>;   // true = ya verificó o no se le pide código
  locks: Record<number, { locked: boolean; lockedUntil: string | null }>;
  required: Record<number, boolean>; // HU-50: false = no pedir el código, mostrar el formulario directo
}
```

**Sin `includeLocks` la respuesta no cambia** (`{ [teamId]: boolean }`).

### `POST /team-verification/verify`
Si el equipo no exige código responde `{ verified: true, required: false }` sin validar nada (no cuenta como intento).

### Calificar
`POST /evaluation/with-details` y el lote ya respetan la regla: un equipo sin código exigido se califica sin verificar. Con el código exigido y sin verificar, sigue el 403 de antes.

## Qué tiene que hacer el front (ARK-311)
1. **Equipos inscritos:** opción en el menú «⋮» para desactivar o activar el código del equipo (`PATCH /team-verification/:teamId/required`) e indicador en la lista con `verificationRequired`. No mostrarla en N0 ni en equipos no calificables.
2. **Configuración del evento:** interruptor «Exigir código de verificación a los jurados» con `GET`/`PATCH /settings/verification-codes`, mostrando quién y cuándo lo cambió.
3. **TeamVerificationGate** y **BatchRatePage:** usar `required[teamId]` de `GET /team-verification/status?includeLocks=true`; con `false`, no pedir el código.
