# Contrato de API · HU-40 · Jugar en el computador los videojuegos de los equipos

**Para:** Camilo Acevedo (Frontend) · **De:** Samuel Tilano (Backend)
**Ticket:** ARK-226 (backend) / ARK-225 (frontend) · **Rama backend:** `feat/ARK-226-zip-200mb-historical-game-file` · **Estado:** implementado y probado en local (Swagger con Playwright), pendiente de PR
Swagger local: `http://localhost:3000/api` (sección *historicals*)

## Qué hace
1. **Zip de hasta 200 MB.** `POST /upload/zip` acepta hasta 200 MB (antes 100 MB). El nginx del API ya acepta 210m (ARK-227, Santiago).
2. **«Jugar» en un juego histórico.** Ruta nueva que devuelve el archivo jugable de un `HistoricalVideogame` por su id. Sirve para:
   - la página de ediciones pasadas (`HistoricalVideogamesPage`), que hoy manda el id del juego histórico a `/videogames/:id` y abre otro juego o da 404;
   - los destacados de HU-41 cuando `play.type === 'historical'` (`GET /highlighted-games` ya trae `play: { type, id }` y `hasGameFile`).

## Roles y permisos
- `GET /historicals/videogames/:historicalVideogameId/game-file` es **pública**: no necesita sesión. No trae integrantes, correos ni códigos.
- `POST /upload/zip` sigue igual: sesión o token reCAPTCHA, 3 subidas cada 10 minutos.

## Reglas generales
- Errores con el formato de Nest: `{ statusCode, message, error }`. `message` viene en español.
- `gameFileURL` es una URL firmada que **vence en 1 hora**. No guardarla: pedirla cada vez que se abre el juego.

## Tipos (TypeScript)
```ts
// Igual a lo que hoy devuelve GET /videogames/:id, para que /play-game use el mismo cargador.
interface HistoricalGameFile {
  id: number;          // id del HistoricalVideogame
  name: string;
  teamName: string;
  editionId: number;
  gameFileURL: string; // URL firmada del .zip; '' si el juego no tiene zip
  entry: string;       // archivo que abre el juego dentro del zip (p. ej. 'Build/index.html'); '' si no hay zip
}
```

## `GET /historicals/videogames/:historicalVideogameId/game-file`
Sin body ni query.

**200**
```json
{
  "id": 12,
  "name": "Ecos del Aula",
  "teamName": "Los Pixel",
  "editionId": 3,
  "gameFileURL": "https://…blob.core.windows.net/…/juego.zip?sv=…&sig=…",
  "entry": "index.html"
}
```

| Código | Cuándo | Qué mostrar |
|---|---|---|
| 200 con `gameFileURL` | El juego tiene zip | Cargar el juego como hoy con `/videogames/:id` |
| 200 con `gameFileURL: ''` | El juego no tiene zip. **Hoy ningún juego de ediciones archivadas tiene zip** | «Este juego no tiene una versión para jugar» (el mensaje de F4). Mejor ocultar «Jugar» si se sabe antes (`hasGameFile` en destacados; `gameFileUrl` en la lista de históricos) |
| 400 | El id no es un número entero | «El identificador debe ser un número entero» (error de enlace) |
| 404 | No existe el juego histórico | «No existe el videojuego histórico 12»: página de juego no encontrado |

## `POST /upload/zip` (cambia solo el límite)
| Código | Cuándo | Qué mostrar |
|---|---|---|
| 201 | Subió | Igual que hoy |
| 413 | Más de 200 MB | El `message` del back: «El archivo supera el máximo de 200 MB.» (F8: hoy el front muestra un texto fijo de 500 MB) |
| 400 | Zip dañado, sin `index.html`, varios `.html` o no es zip | El `message` del back (ver `docs/arkad/01-negocio/juegos-web-por-motor.md`, «Mensajes que ve quien sube el zip») |

## Notas de UI
- **Cómo distinguir los dos tipos de juego en `/play-game`.** El id de `Videogame` y el de `HistoricalVideogame` son secuencias distintas: el mismo número puede ser de un juego en vivo y de uno histórico. La ruta del front necesita saber cuál es, por ejemplo `/play-game/historical/:id` o `/play-game/:id?type=historical`. Eso lo decides tú.
- **Límite en el registro (F8):** 200 MB como máximo y la recomendación de 50 MB o menos (decisión de Allison del 16-nov).
- La lista pública `GET /historicals/historical-videogames/:editionId` no cambia; ya trae `gameFileUrl` firmado y `entry` de cada juego, por si sirve para ocultar «Jugar».

## Preguntas para Frontend
1. ¿Qué ruta del front usarás para los juegos históricos (pregunta de las notas de UI)?
2. ¿Te sirve la misma forma de `GET /videogames/:id` o prefieres otra?
