# Roles y permisos

> **Audiencia:** Backend, Frontend · **Actualizado:** 2026-11-05 · **Estado:** parcial (modelo y matriz del backlog; verificar contra `seed-data.json` y guards) · **Fuente:** backlog §2.1; entrega de Santiago `CONTRIBUTING-back.md`

## Modelo
- **Un usuario, un rol.** Roles y permisos viven en la BD (tablas `Role`, `Service`, `Permission`, `RolePermission`, `ServicePermission`). No hay pantalla para administrarlos: se crean por **migración** (el seed solo sirve para bases nuevas).
- Roles (5): **Administrador, Estudiante, Profesor, Jurado, Staff**. (El front menciona un «Consultor» sin uso: es un resto.)
- **El Administrador pasa todas las verificaciones** y se reconoce **por el nombre del rol** (`ADMIN_ROLE_NAME`), no por un permiso. Ningún rol nuevo puede llamarse «Administrador».
- Un servicio **sin ningún permiso asignado queda abierto a cualquier usuario con sesión**: todo servicio nuevo debe nacer con su permiso y una prueba que confirme que los roles sin permiso reciben error.
- Los permisos y servicios se guardan en **caché** (30 min a 2 h): tras una migración de permisos, reiniciar el backend o esperar al vencimiento.
- En el módulo de equipos hay tres comprobaciones que suponen Administrador = rol 1 (conviene cambiarlas).
- Una persona no puede ser staff y jurado con la misma cuenta.

## Mecanismo en el backend
`JwtAuthGuard` global (`APP_GUARD`), `@Public()` para rutas abiertas, y `RolePermissionGuard` con `@RequiredService`. Hay además `AdminRole`, `OptionalJwtAuth` y `PendingGames`. Ver [02-backend/auth-y-sesiones](../02-backend/auth-y-sesiones.md).

## Matriz (lo que cada rol debería poder)

| Capacidad | Admin | Estudiante | Profesor | Jurado | Staff |
|---|---|---|---|---|---|
| Ver/editar su perfil | Sí | Sí | Sí | Sí | Sí |
| Editar su equipo, ver evaluaciones/nota recibida e integrantes | Sí | Sí | No | No | No |
| Ver materias, juegos pendientes y criterios | Sí | No | Sí | Sí | No |
| Calificar | Sí | No | Sí | Sí | No |
| Ver sus NRC, reportes por NRC/materia, exportar a Excel y guardar notas | Sí | No | Sí | No | No |
| Administrar (asignar jurados, seguimiento, ediciones, landing, materias, NRC, criterios, ranking, desempate) | Sí | No | No | No | No |
| Panel de seguimiento (solo lectura para el profesor) | Sí | No | Sí | Solo si es senior | No |
| Check-in por QR o nombre | Sí | No | No | No | Sí |
| Tabla de asistencia de jurados (HU-29) | Sí | No | No | No | Sí (solo lectura) |

El Staff, al escanear un QR, ve únicamente nombre y grupos del jurado.

## Estado del control de permisos
Al 21-oct: las rutas de jurados, profesores, criterios, materias, NRC, configuración y equipos exigían permiso; ediciones, histórico, landing, videojuegos, reportes, miembros y correos solo pedían sesión (BG-01); reporte de jurados, histórico con notas y carga de archivos eran públicos (BG-02). Después se abrieron BG-06 (correos de jurados) y BG-07 (leer cualquier equipo).

**Estado a 2026-11-05:** BG-01, BG-02, BG-06 y BG-07 están en «Hecho» en Jira, y el inventario generado sobre producción (`origin/main`) da **203 rutas: 145 con permiso por servicio, 48 públicas, 10 solo con sesión y 0 sin decidir**. Tabla completa por ruta y rol: [02-backend/inventario-de-rutas](../02-backend/inventario-de-rutas.md). Para refrescarla: `npm run routes:inventory`; la prueba `route-access.spec.ts` impide dejar una ruta sin decidir.
> A CONFIRMAR con Backend: revisar con ojo humano las 48 rutas públicas (son la superficie sin sesión) antes de la feria.

## Qué tocar al agregar un rol (frontend)
El nombre del rol está en varios sitios: el tipo de roles, el menú lateral por rol, la lista de rutas permitidas y la pantalla de inicio. Si falta alguno, el usuario verá «no autorizado» o un menú vacío. Las cuentas de staff se crean reutilizando el flujo de jurados (registrar correo + rol; la persona completa su cuenta con contraseña o Microsoft).
