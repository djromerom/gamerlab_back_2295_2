# Contrato back → front: récord global de los minijuegos de la landing (HU-52)

**Back:** ARK-315, rama `fix/ARK-315-records-minijuegos`, PR a `dev`.
**Front:** ARK-316 (Jorge), sobre `dev-deploy`, en `src/features/public/components/minigames/` (`arkadash.ts`, `arkadJam.ts`).

`GET` y `POST` son **públicas** (sin sesión) y tienen límite de peticiones por IP. Solo guardan el alias y el puntaje: ningún dato de quien juega. `DELETE` es solo del Administrador (sección 4).

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
    { "position": 1, "alias": "PIX", "score": 41250, "track": "guitarra-3", "createdAt": "2026-11-26T15:02:11.000Z" },
    { "position": 2, "alias": "NOV", "score": 38900, "track": "guitarra-3", "createdAt": "2026-11-26T14:40:03.000Z" }
  ]
}
```

- Mayor puntaje primero; en un empate va primero el que llegó antes.
- `top` tiene de 0 a 5 filas. El récord global es `top[0]` (si existe).
- Arkad Jam **sin `track`**: top 5 de todas las canciones (`track: null`); cada fila dice su canción. Sirve para la landing.
- `400` con `code: "MINIGAME_RECORD_INVALID"` si el juego o la canción no existen.
- Si quien consulta es el **Administrador** (con su sesión), cada fila trae además su `id`, para poder borrarla. A los demás no les llega.

## 3. `POST /minigame-records`: guardar un puntaje

```json
{ "game": "ARKAD_JAM", "track": "guitarra-3", "alias": "PIX", "score": 41250 }
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
| `MINIGAME_ALIAS_INVALID` | El alias no tiene exactamente 3 caracteres, o tiene algo distinto de letras y números (sin espacios ni signos). | «El alias lleva 3 letras o números.» |
| `MINIGAME_ALIAS_OFFENSIVE` | El alias es una abreviatura grosera (`HPT`, `PTA`, `MRD`, `CTM`, `WTF`, `FCK`…), también con números en lugar de letras (`P7A`) o con `HP` o `QL` dentro. | El que manda el back: «Elige otro alias: este no se puede mostrar en la pantalla principal». |
| `MINIGAME_SCORE_IMPOSSIBLE` | Puntaje que no es entero, menor que 1 o mayor que el tope: Arkadash 10 000, Arkad Jam 100 000. | No mostrar en el top. |
| `MINIGAME_RECORD_INVALID` | Juego o canción que no existe, o Arkadash con `track`. | No mostrar en el top. |

`429`: demasiadas peticiones desde esa IP (20 guardados o 300 consultas por minuto). Seguir con el récord local.

El alias es de **3 caracteres**, como las iniciales de las máquinas arcade. Llega sin espacios al inicio ni al final: mostrar el `alias` de la respuesta. Los récords guardados antes de este cambio pueden tener un alias más largo; mostrarlo tal cual.

## 4. `DELETE /minigame-records/:id`: borrar un récord (solo Administrador)

Para quitar un alias grosero o un puntaje falso de la pantalla principal durante la feria.

- Con sesión de Administrador. Sin sesión `401`; otro rol `403`.
- Respuesta `200`: el top de ese juego o canción ya sin el récord, con el `id` de cada fila (los demás suben un puesto; el top queda con uno menos hasta que entre otro puntaje).
- `404` con `code: "MINIGAME_RECORD_NOT_FOUND"` si no existe o ya se borró: refrescar el top.
- El `id` sale del `GET` hecho con la sesión del Administrador. Dónde poner el botón (por ejemplo, una «x» junto a cada fila del top cuando quien mira es Administrador) lo decide el front; si no entra en ARK-316, el back ya lo deja listo.

## 5. Qué hacer en el front (criterios de HU-52)

1. Al terminar una partida, pedir el top (`GET`) y mostrar el récord global (`top[0]`) y el mejor personal (el `localStorage` de siempre).
2. Si el puntaje supera el top (hay menos de 5 o es mayor que `top[4].score`), ofrecer guardar un alias de 3 letras o números y enviarlo con `POST`. Validar en el front que sean 3 (`maxLength=3`).
3. Con `saved: true`, mostrar el puesto (`position`) y el top que vuelve.
4. En la landing, el top 5 de cada juego: Arkadash con `game=ARKADASH` y Arkad Jam con `game=ARKAD_JAM` (sin `track`, o el de la canción elegida).
5. Si el back no responde, da `429` o cualquier error: el juego sigue igual con el récord local y no se muestra el top global.
6. No guardar nada de la persona además del alias.

## 6. Cómo probarlo en Arkad-test

1. Terminar una partida de Arkadash con un puntaje: aparece la opción de guardar el alias; al guardarlo, sale en el top con su puesto.
2. Con 5 récords en una canción de Arkad Jam, un puntaje menor que el quinto no ofrece guardar.
3. Un alias de 2 o de 4 caracteres, o con un espacio o un signo, muestra el mensaje y no se guarda.
4. Con el back apagado, el juego funciona y guarda el récord local.
5. Un alias como `HPT`, `P7A` o `WTF` muestra el mensaje de «Elige otro alias» y no se guarda.
