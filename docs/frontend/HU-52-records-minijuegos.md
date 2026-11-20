# Contrato back → front: récord global de los minijuegos de la landing (HU-52)

**Back:** ARK-315, rama `fix/ARK-315-records-minijuegos`, PR a `dev`.
**Front:** ARK-316 (Jorge), sobre `dev-deploy`, en `src/features/public/components/minigames/` (`arkadash.ts`, `arkadJam.ts`).

Las dos rutas son **públicas** (sin sesión) y tienen límite de peticiones por IP. Solo guardan el alias y el puntaje: ningún dato de quien juega.

## 1. Juegos y pistas

| Juego | `game` | `track` |
|---|---|---|
| Arkadash | `ARKADASH` | No se envía: tiene un solo récord global (la respuesta trae `"global"`). |
| Arkad Jam | `ARKAD_JAM` | `<instrumento>-<índice de la canción>`: `guitarra-3`, `piano-0`, `bateria-11`. Es el mismo sufijo de la clave local `arkadjam-${actual}-${i}`. El nivel va implícito en la canción. |

Instrumentos: `guitarra`, `piano`, `bateria`. Índice de 0 a 49.

## 2. `GET /minigame-records?game=&track=`: top 5

```json
{
  "game": "ARKAD_JAM",
  "track": "guitarra-3",
  "top": [
    { "position": 1, "alias": "Pixel", "score": 41250, "track": "guitarra-3", "createdAt": "2026-11-26T15:02:11.000Z" },
    { "position": 2, "alias": "Nova", "score": 38900, "track": "guitarra-3", "createdAt": "2026-11-26T14:40:03.000Z" }
  ]
}
```

- Mayor puntaje primero; en un empate va primero el que llegó antes.
- `top` tiene de 0 a 5 filas. El récord global es `top[0]` (si existe).
- Arkad Jam **sin `track`**: top 5 de todas las canciones (`track: null`); cada fila dice su canción. Sirve para la landing.
- `400` con `code: "MINIGAME_RECORD_INVALID"` si el juego o la canción no existen.

## 3. `POST /minigame-records`: guardar un puntaje

```json
{ "game": "ARKAD_JAM", "track": "guitarra-3", "alias": "Pixel", "score": 41250 }
```

Respuesta `200`:

```json
{ "game": "ARKAD_JAM", "track": "guitarra-3", "saved": true, "position": 1, "top": [ … ] }
```

- Se guarda **solo si entra en el top 5** de ese juego o canción. Si no entra: `saved: false`, `position: null` y el top actual (no es un error).
- Con el top lleno, hay que **superar** al quinto: un empate con el quinto no entra.
- El back conserva solo los 5 mejores de cada pista.

Errores `400` (campo `code`):

| `code` | Cuándo | Mensaje sugerido |
|---|---|---|
| `MINIGAME_ALIAS_INVALID` | Alias de menos de 3 o más de 12 caracteres, o con algo distinto de letras, números, espacio, punto, guion o guion bajo. | «El alias lleva de 3 a 12 letras o números.» |
| `MINIGAME_ALIAS_PERSONAL_DATA` | 6 dígitos o más seguidos, o algo con forma de teléfono. | «No uses tu código, documento ni teléfono.» |
| `MINIGAME_SCORE_IMPOSSIBLE` | Puntaje que no es entero, menor que 1 o mayor que el tope: Arkadash 10 000, Arkad Jam 100 000. | No mostrar en el top. |
| `MINIGAME_RECORD_INVALID` | Juego o canción que no existe, o Arkadash con `track`. | No mostrar en el top. |

`429`: demasiadas peticiones desde esa IP (20 guardados o 300 consultas por minuto). Seguir con el récord local.

El alias llega sin espacios al inicio ni al final y con los espacios repetidos unidos: mostrar el `alias` de la respuesta.

## 4. Qué hacer en el front (criterios de HU-52)

1. Al terminar una partida, pedir el top (`GET`) y mostrar el récord global (`top[0]`) y el mejor personal (el `localStorage` de siempre).
2. Si el puntaje supera el top (hay menos de 5 o es mayor que `top[4].score`), ofrecer guardar un alias de 3 a 12 caracteres y enviarlo con `POST`. Validar el largo en el front también.
3. Con `saved: true`, mostrar el puesto (`position`) y el top que vuelve.
4. En la landing, el top 5 de cada juego: Arkadash con `game=ARKADASH` y Arkad Jam con `game=ARKAD_JAM` (sin `track`, o el de la canción elegida).
5. Si el back no responde, da `429` o cualquier error: el juego sigue igual con el récord local y no se muestra el top global.
6. No guardar nada de la persona además del alias.

## 5. Cómo probarlo en Arkad-test

1. Terminar una partida de Arkadash con un puntaje: aparece la opción de guardar el alias; al guardarlo, sale en el top con su puesto.
2. Con 5 récords en una canción de Arkad Jam, un puntaje menor que el quinto no ofrece guardar.
3. Un alias de 2 caracteres o con un número de 6 dígitos muestra el mensaje y no se guarda.
4. Con el back apagado, el juego funciona y guarda el récord local.
