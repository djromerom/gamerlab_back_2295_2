# Contrato de API · TA-36 · «Se puede jugar en celular» como campo del videojuego

**De:** Samuel Tilano (Backend y Frontend) · **Ticket:** ARK-326 (TA-36), deuda de ARK-317 · **Ramas:** back y front `feat/ARK-326-videogame-allow-mobile`
Swagger local: `http://localhost:3000/api` (secciones *teams*, *videogames*, *historicals*, *highlighted-games*)

## Qué cambia
Hasta ahora, los juegos que sí se juegan en el celular eran una lista de ids escrita en el front (`src/features/games/lib/mobileFriendly.ts`, `294` = Brainrot Breakout en producción). Ahora es un campo del videojuego, `allowMobile`, que activa el Administrador:

- `false` (por defecto, todos los juegos): en celulares y tabletas se muestra «Este juego se juega en computador» y no se descarga el zip (HU-40).
- `true`: el juego se ofrece y se abre también en el celular (BG-77: a pantalla completa en `/play-game/:id`).

Al archivar la edición, el valor se copia al videojuego histórico.

## Roles
- **Leer**: lo devuelven las mismas rutas que hoy devuelven el videojuego (públicas o no, según la ruta).
- **Cambiar**: solo el Administrador. Un estudiante que envía `allowMobile` con un valor distinto al guardado recibe **403** «Solo el administrador puede cambiar si el juego se puede jugar en celular. Para cambiar este dato, escríbele al administrador.». Enviar el mismo valor no es un cambio.
- Al **inscribir** el equipo (`POST /teams`, `POST /teams/admin`) no se acepta: el back lo descarta y el juego queda en `false`. El interruptor solo aparece al editar.

## Dónde llega
| Ruta | Campo |
|---|---|
| `GET /videogames/:id` (lo usa `/play-game/:id`) | `allowMobile: boolean` |
| `GET /historicals/videogames/:historicalVideogameId/game-file` (lo usa `/play-game/historical/:id`) | `allowMobile: boolean` |
| `GET /highlighted-games` (pública, landing) | `allowMobile: boolean` en cada destacado |
| `GET /teams` (listados) y `GET /teams/:id/full` | `videogame.allowMobile` |
| `GET /historicals/historical-teams-with-scores/:editionId` y demás listados históricos | `videogame.allowMobile` |

## Cómo se cambia
`PATCH /teams/:id` (Editar equipo, paso 3):
```json
{ "videogame": { "allowMobile": true } }
```
También aceptan `allowMobile` `PATCH /videogames/:id` y `PATCH /historicals/update-historical-videogame/:id`.

**Errores:** 400 si no es booleano («allowMobile debe ser true o false»); 403 si lo cambia quien no es Administrador.

## Cambios en el front (rama `feat/ARK-326-videogame-allow-mobile`)
- Interruptor «Se puede jugar en celular» en Equipos inscritos → ⋮ → Editar → paso 3 (solo al editar). Solo manda `allowMobile` si cambió.
- `useGameLoader(kind, id, touchOnly)`: en el celular primero pide el juego y, si no tiene `allowMobile`, queda en el estado `touchOnly` sin descargar el zip.
- `GameDetailModal`, `StudentGamesPanel` y las páginas de juegos en vivo e históricos usan el campo. Se borra `mobileFriendly.ts`.

## Despliegue (importante)
1. Migración `20261124000000_add_videogame_allow_mobile` (aditiva; todos los juegos quedan en `false`).
2. **En cuanto el back y el front nuevos estén arriba, el Administrador activa el interruptor de Brainrot Breakout** (Scroll Studios). Mientras no lo haga, ese juego vuelve a mostrar el aviso de computador en el celular. La migración no lo marca porque su id cambia entre Arkad-test y producción.
3. Mergear después de la feria del 26-nov (pedido de Santiago en ARK-326).
