# Juegos web por motor: qué funciona en ARKAD (SP-03)

> **Audiencia:** todo el equipo, Scrum Master (instructivo TA-23) · **Actualizado:** 2026-11-16 (decisiones de HU-40) · **Estado:** escritorio y Arkad-test verificados (celular emulado); falta un celular real (audio de iPhone, memoria y PWA) · **Naturaleza:** spike de investigación. Aquí van hallazgos y recomendaciones; las decisiones y la asignación de tareas son de la Scrum Master (ver «Decisiones», 15 y 16-nov). · **Fuente:** SP-03 (ARK-38, Samuel Tilano): código de `origin/dev` (back) y `origin/dev-deploy` (front) del 15-nov, builds reales probados con el `public/sw.js` real.

## Cómo se juega un juego hoy
1. **Subida:** el administrador sube un `.zip` en **Equipos Inscritos** → Editar → paso 3 «Archivo ZIP del proyecto» (`POST /upload/zip`). El back acepta hasta **200 MB** (HU-40; antes 100 MB), revisa que sea un zip real y elige el archivo de entrada (`index.html`).
2. **Reproducción:** la página `/play-game/:id` descarga el zip completo. El service worker del front (`src/sw.ts`, compilado en `public/sw.js`) lo descomprime con JSZip, guarda los archivos **en memoria** y los sirve en `/play-game/<id>/...` dentro de un iframe.
   - Descomprime `.gz` solo dentro de una carpeta `Build/`; los `.br` los entrega tal cual.
   - El iframe recibe `Cross-Origin-Embedder-Policy: require-corp`, pero la página padre no envía COOP ni COEP: **el juego nunca queda aislado** (`crossOriginIsolated = false`, sin `SharedArrayBuffer`).

## Resultado por motor

Probado el 15-nov con builds reales y el `public/sw.js` real de `dev-deploy`, en un servidor que imita al de Arkad-test (página padre sin COOP/COEP). **Hoy** es el SW actual; **con F1** es el mismo SW con COEP `credentialless`. WebKit es el motor de Safari en Playwright para Windows: aproxima a Safari, no lo reemplaza.

| Motor y exportación | Peso del zip | Chrome / Edge | Firefox | WebKit (≈ Safari) | Recomendación |
|---|---|---|---|---|---|
| **Godot 4.5 sin hilos** | 9,4 MB | Funciona | Funciona | Funciona | **Funciona** |
| Godot 4.5 con hilos | 9,4 MB | No: «Cross-Origin Isolation / SharedArrayBuffer missing» | No | No | **No soportado** (hace falta T1) |
| **Unity 6 Gzip** | 18,5 MB | Funciona | Funciona | Funciona | **Funciona** |
| **Unity 6 Brotli con Decompression Fallback** (y Gzip con fallback) | 14,5 MB | Funciona | Funciona | Funciona | **Funciona** |
| **Unity 6 sin compresión** | 19,0 MB | Funciona | Funciona | Funciona | **Funciona** |
| Unity 6 Brotli sin fallback | 16,5 MB | No: «Unable to parse Build/…framework.js.br» | No | No | **No soportado**: usar Gzip o el fallback |
| **Pygame (pygbag 0.9.3)** | 21 KB (+21 MB del CDN) | Hoy no / con F1 sí | Hoy no / con F1 sí | Hoy no / con F1 sí | **Con condiciones:** solo después de F1 y con internet |
| HTML5/JS con svg o `.mjs` | — | svg en `<img>` y `.mjs` no cargan | Igual | Igual | **Con condiciones** hasta F3 |

- Lo que funciona tarda de 1,5 a 4 s en abrir (en local; en la red de la feria será más). El audio funciona en Chrome, Edge y Firefox; el WebKit de Playwright para Windows no trae audio, así que Safari queda por probar en el iPhone.
- `crossOriginIsolated` es `false` en todos los casos: ningún motor puede usar hilos en ARKAD.
- Builds: Godot 4.5-stable oficial (proyecto mínimo con escena, sonido OGG, imagen PNG y GDScript); Unity 6000.0.25f1 del proyecto de ejemplo [AspNetCore-Unity-WebGL](https://github.com/synboxdev/AspNetCore-Unity-WebGL) (MIT). Las variantes Unity Gzip y Brotli sin fallback se derivaron comprimiendo la versión sin compresión.
### En Arkad-test (15-nov, celular emulado)
Zips subidos por el Administrador a equipos de prueba de Arkad-test y abiertos con «Jugar» (`/play-game/:id`), con sesión de Administrador. Los celulares son **emulados**: Chrome con el perfil de un Pixel 7 (pantalla táctil, viewport de celular) y WebKit con el perfil de un iPhone 14. Comprueban que el juego abre, cuánto tarda y que responde al toque, pero **no** reemplazan un teléfono real: no miden su memoria ni el audio de iOS, y no prueban la PWA instalada.

| Juego (zip) | Chrome escritorio | Android emulado (Chrome) | iPhone emulado (WebKit) |
|---|---|---|---|
| Godot sin hilos (`godot-sin-hilos.zip`) | Abre en 4,8 s; responde; audio activo tras el clic | Abre en 4,7 s; responde al toque; audio activo | Abre en 7,9 s; responde al toque; audio sin comprobar |
| Unity Gzip (`unity-u1-gzip.zip`) | Abre en 4,5 s; audio activo | Abre en 4,2 s; audio activo | Abre en 6,3 s; audio sin comprobar |
| Unity sin compresión (`unity-u4-sin-compresion.zip`, 19 MB) | Abre en 5,4 s; audio activo | Abre en 5,3 s; audio activo | Abre en 6,9 s; audio sin comprobar |
| Pygame (`pygbag-minijuego.zip`) | **No carga**: queda en «Loading, please wait…» (bloqueo por COEP) | **No carga** (igual) | **No carga** (bloqueo por CORP) |

- Los tiempos van desde que se abre `/play-game/:id` hasta que el juego está listo, en la red de la casa; en el wifi de la feria serán mayores.
- **2 minutos quieto** (Godot y Unity sin compresión en Android emulado; Unity Gzip en iPhone emulado): el juego sigue respondiendo al tocar de nuevo, aunque Chrome detiene el SW a los 30 s sin uso. Coincide con R4: el juego ya abierto no se cae.
- En celular vertical, el juego de Godot se dibuja en la parte de arriba del iframe, en 16:9. Conviene que los equipos usen el *stretch mode* `canvas_items` con aspecto `expand`, y la pantalla completa (F7).
- Errores del registro observados en Arkad-test al subir: zip dañado → «Error al guardar - Internal Server Error» (B1 lo corrige); zip de 101 MB → «Uno de los archivos es demasiado grande. El tamaño máximo permitido es **500MB**». Ese texto lo arma el front ante cualquier 413 y no muestra el mensaje del back (F8).
- **iPhone real (prueba de Samuel, 15-nov):** el juego abre, pero **el audio no suena**. Falta saber la causa. Puede ser el iframe sin `allow="autoplay"` (F7), el modo silencio del iPhone o el formato de audio del build. Mientras tanto, hay que avisar a los equipos y a los jurados que en iPhone el juego puede no tener sonido.
- **Pendiente en un celular real:** memoria con un juego de 60 a 100 MB en un celular de gama media y la PWA de jurado instalada. Capturas de la prueba emulada: carpeta `SP-03-ARK-38\capturas\arkad-test\` de Samuel (no van en el repo).

## Riesgos R1–R6

| Riesgo | Veredicto | Evidencia |
|---|---|---|
| **R1** Unity con Brotli no carga | **Confirmado** solo sin «Decompression Fallback». Gzip, el fallback y sin compresión funcionan. | El SW entrega los `.br` sin descomprimir ni `Content-Encoding` (`sw.ts:126`); error «Unable to parse …framework.js.br» en los 4 navegadores. |
| **R2** pygbag bloqueado por COEP | **Confirmado: hoy no carga en ningún navegador.** Con F1 carga en los 4. Necesita internet (21 MB del CDN por carga). | Chrome: `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`; Firefox y WebKit: bloqueo por CORP de `pygame-web.github.io`. |
| **R3** Godot con hilos | **Confirmado: no funciona.** Godot sin hilos funciona en todos. | La página padre no envía COOP/COEP (`nginx.conf`; cabeceras de Arkad-test revisadas el 15-nov); Godot muestra «Cross-Origin Isolation – SharedArrayBuffer missing». |
| **R4** Memoria y SW detenido | **Confirmado en parte.** Con el SW detenido, el juego abierto sigue respondiendo, pero cualquier archivo que pida después o una recarga reciben el `index.html` de ARKAD. En Arkad-test, con celular emulado, el juego sigue respondiendo después de 2 minutos quieto. La memoria en un celular real queda por medir. | Prueba con el SW detenido (Chrome y Edge, Godot y Unity); `sw.ts:114-117`. Correcciones F5 y F6. |
| **R5** Tipos de archivo | **Confirmado en parte.** Fallan `.svg` en `<img>`, `.mjs` y los nombres con espacios o tildes. wav, ttf, css, gif y webp funcionan. | Sonda de tipos en los 4 navegadores; `sw.ts:170-195`. Correcciones F2 y F3. |
| **R6** Actualización de la PWA | **Descartado por el código:** una versión nueva del SW espera a que se cierren las pestañas (no hay `skipWaiting`). Riesgo residual: un juego exportado con PWA registraría su propio SW; las instrucciones lo prohíben. | `sw.ts` sin `install`/`skipWaiting`; `PwaUpdateNotice.tsx:70-74`. |

## Instrucciones para los equipos (para el instructivo TA-23)

Actualizadas con las decisiones de la Scrum Master del 15 y 16-nov (TA-28, ARK-234). El texto de abajo está listo para copiar al instructivo. Cómo monta la administradora cada juego: [montaje de los videojuegos](montaje-de-videojuegos.md).

**Cómo se entrega**
- **No subes el zip a ARKAD.** Súbelo a tu OneDrive o Google Drive, compártelo como «Cualquier persona con el vínculo puede ver» y pega el enlace en el formulario, junto con el nombre del equipo y el motor. La administración lo descarga, lo monta y te avisa si hay que corregir algo.
- Tu juego se jugará **solo en computador** (Chrome, Edge o Firefox). En el celular, ARKAD muestra un aviso en lugar del juego. Si tu juego trae controles táctiles propios, pídele al administrador que active «Se puede jugar en celular» (TA-36).

**Para todos**
- Entrega **un solo .zip** de **máximo 200 MB**. Mientras más liviano mejor: lo ideal es **50 MB o menos**, porque carga más rápido.
- El zip debe tener `index.html` **en la raíz**: comprime el **contenido** de la carpeta exportada, no la carpeta. Si tu exportación genera otro nombre (`MiJuego.html`), cámbialo a `index.html`.
- Nombres de archivos y carpetas **sin espacios, tildes ni ñ** (`musica_fondo.ogg`, no `Música Fondo.ogg`). Respeta mayúsculas y minúsculas.
- En Mac, borra la carpeta `__MACOSX` o comprime desde la terminal: `cd build && zip -r ../juego.zip . -x "__MACOSX/*" -x "*.DS_Store"`.
- **No** actives opciones de PWA, service worker ni «offline» en la exportación.
- Imágenes en PNG, JPG, GIF o WEBP; **no uses SVG** ni scripts `.mjs` hasta que se corrija F3.

**No están soportados en esta feria**
- **Godot con hilos** (*Thread Support* activado).
- **Unity con Brotli sin *Decompression Fallback***.

**Unity (WebGL / Web)**
- Player Settings → Publishing Settings → **Compression Format: Gzip** (o *Disabled*). Si usas Brotli, activa **Decompression Fallback**; sin eso el juego no abre.
- No cambies el nombre de la carpeta `Build/`.
- Deja desactivado el multihilo (Unity 6: *Native C/C++ Multithreading*).
- Sube el **contenido** de la carpeta de salida: `index.html`, `Build/`, `TemplateData/` y `StreamingAssets/` si existe.

**Godot 4 (4.3 o superior)**
- Exporta con la plantilla Web y **Thread Support desactivado** (el valor por defecto desde 4.3); con hilos el juego no abre. **No** actives *Progressive Web App*.
- Exporta con el nombre `index.html` (o renómbralo).
- Los proyectos en **C#** no se pueden exportar a web con Godot 4: usa GDScript.

**Pygame (pygbag)**: soportado cuando esté desplegada la corrección F1 del front (HU-40); antes no carga. Necesita internet.
- Archivo principal `main.py` con bucle `async` y `await asyncio.sleep(0)` en cada vuelta.
- Audio en **OGG**; imágenes en PNG, WEBP o JPG.
- Ejecuta `pygbag --build <carpeta>` y sube el contenido de `build/web/` (`index.html`, `<nombre>.apk`, `favicon.png`).
- El juego descarga unos **21 MB** del CDN de pygbag cada vez que se abre: **necesita internet** en la feria.

**HTML5 / JavaScript**
- Rutas relativas, scripts `.js` (no `.mjs`) y sin llamadas a servidores propios que usen cookies.

## Mensajes que ve quien sube el zip (back, desde `fix/ARK-38-zip-upload-errors`)
| Caso | Respuesta |
|---|---|
| Zip dañado o cortado | 400 «El archivo .zip está dañado o no se pudo leer. Vuelve a comprimir el juego e inténtalo de nuevo.» (antes: 500 «Internal server error») |
| Más de 200 MB | 413 «El archivo supera el máximo de 200 MB.» (antes: «File too large»; hasta HU-40 el máximo era 100 MB) |
| Sin ningún `.html` | 400 «El archivo .zip no tiene un index.html. Comprime el contenido de la carpeta exportada del juego, con index.html en la raíz.» |
| Varios `.html` y ninguno `index.html` | 400 que lista los `.html` encontrados y pide renombrar el que abre el juego |
| `index.html` en una subcarpeta | Se acepta: se usa el `index.html` más cercano a la raíz |
| Basura de macOS (`__MACOSX/._index.html`) | Se ignora (antes podía quedar como entrada y el juego no abría) |
| `JUEGO.ZIP` en mayúsculas o enviado como `application/octet-stream` | Se acepta y se revisa igual |
| Archivo que no es zip | 400 «El contenido del archivo no corresponde a un .zip» |

## Correcciones recomendadas
Tamaño: XS < 1 h, S ≈ medio día, M ≈ 1–2 días. «Área» es una sugerencia; quién la toma y cuándo lo decide la Scrum Master. B1–B4 se hicieron en el spike. Allison decidió el resto el 15-nov: F1–F8 entran en HU-40 (ARK-225, Camilo), I1 en ARK-227 (Santiago) y T1 queda para después de la feria.

| # | Dónde | Cambio | Área sugerida | Tamaño | Estado / sugerencia |
|---|---|---|---|---|---|
| **F1** | front `src/sw.ts:152` (+ recompilar `public/sw.js`) | COEP del iframe: `require-corp` → `credentialless`. Sin esto **pygbag no carga** (el CDN de pygbag no envía `Cross-Origin-Resource-Policy`). Hoy no aporta nada, porque la página padre no está aislada. | Frontend | XS | HU-40 (ARK-225, Camilo), mezclado a más tardar el 18-nov |
| F2 | front `sw.ts:109-112` | `decodeURIComponent` de la ruta: archivos con espacios o tildes dan 404 | Frontend | XS | HU-40 (ARK-225, Camilo), mezclado a más tardar el 18-nov |
| F3 | front `sw.ts:175-184` | Tabla de tipos MIME: svg, mjs, gif, webp, mp3, ogg, wav, woff2, ttf… (`.svg` en `<img>` y `.mjs` fallan) | Frontend | XS | HU-40 (ARK-225, Camilo), mezclado a más tardar el 18-nov |
| F4 | front `sw.ts:68-90`, `useGameLoader.ts` | Error visible si el zip no se puede abrir (hoy queda «Cargando archivos del juego...» para siempre) | Frontend | S | HU-40 (ARK-225, Camilo), mezclado a más tardar el 18-nov |
| F5 | front `sw.ts:114-117` | Si el SW se detiene, el juego recibe el `index.html` de ARKAD: responder 404 o guardar en Cache Storage | Frontend | S / M | HU-40 (ARK-225, Camilo), mezclado a más tardar el 18-nov |
| F6 | front `sw.ts:87` | Liberar de memoria los juegos anteriores | Frontend | XS | HU-40 (ARK-225, Camilo), mezclado a más tardar el 18-nov |
| F7 | front `GamePlayerPage.tsx:55-58` | `allow="fullscreen; autoplay; gamepad"` en el iframe (pantalla completa y audio). Después, repetir la prueba de audio en un iPhone real, que hoy no suena | Frontend | XS | HU-40 (ARK-225, Camilo), mezclado a más tardar el 18-nov |
| F8 | front `azureFile.ts:37-39,76`, `TeamWizardDialog.tsx:557-559` | Mostrar y validar el límite real de 200 MB (hoy dice 500 MB) y, ante un 413, mostrar el `message` del back en vez del texto fijo (visto en Arkad-test el 15-nov) | Frontend | XS | HU-40 (ARK-225, Camilo), mezclado a más tardar el 18-nov |
| B1 | back `azure-storage.service.ts` | Zip dañado: 400 en español | Backend (Samuel) | XS | Hecho en `fix/ARK-38-zip-upload-errors` |
| B2 | back `zip-entry.logic.ts` | Entrada: `index.html` más cercano a la raíz, ignorar `__MACOSX` y ocultos, mayúsculas | Backend (Samuel) | S | Hecho en `fix/ARK-38-zip-upload-errors` |
| B3 | back `multer-exception.filter.ts` | 413 en español con el límite | Backend (Samuel) | XS | Hecho en `fix/ARK-38-zip-upload-errors` |
| B4 | back `upload.controller.ts` | Aceptar `.zip` enviado como `application/octet-stream` | Backend (Samuel) | XS | Hecho en `fix/ARK-38-zip-upload-errors` |
| I1 | infra | `client_max_body_size` del nginx del API en 210m (test y producción) | DevOps (Santiago) | XS | Hecho (ARK-227) |
| T1 | front `nginx.conf` | Hilos (Godot o Unity con hilos): COOP/COEP en la página padre. Afecta popups e inicio de sesión. | Frontend + DevOps | M | No antes de la feria (decisión del 15-nov): se avisa que no está soportado |

## Límite de tamaño
**Decidido (Allison, 15-nov; ajustado el 16-nov): 200 MB como máximo, el mismo para el back y para los equipos, y se recomienda 50 MB o menos** porque carga más rápido. El back lo aplica desde HU-40 (`MAX_ZIP_SIZE_MB` en `src/upload/zip-entry.logic.ts`); el nginx del API acepta 210m (I1) y el registro lo mostrará con F8.

- Producción ya tenía zips de más de 100 MB (Break the Cycle, 173 MB), subidos antes de SP-03.
- El zip se recibe en memoria: una subida de 200 MB ocupa unos 200 MB de RAM del back mientras dura. No se cambia antes de la feria.

## Quién sube el zip
Solo el **Administrador** sube zips (Equipos Inscritos → Editar → paso 3, `TeamWizardDialog`); el registro de estudiantes no tiene ese paso. Los equipos comparten un enlace de su OneDrive o Drive y la admin lo descarga y lo sube (decisión del 15-nov; procedimiento en [montaje de los videojuegos](montaje-de-videojuegos.md), TA-28, ARK-232).

## Juegos de ediciones pasadas
«Jugar» en un juego histórico (página de ediciones pasadas o destacados de HU-41) usa `GET /historicals/videogames/:historicalVideogameId/game-file` (HU-40, pública): devuelve la URL firmada del zip por 1 h y el `entry`, con la misma forma que `GET /videogames/:id`. Si el juego no tiene zip, `gameFileURL` y `entry` vienen vacíos. Al 15-nov ningún juego de las ediciones archivadas tiene zip.

## Decisiones (Scrum Master, 15 y 16-nov)
1. **Límite del zip:** 200 MB en el back y para los equipos; se recomienda 50 MB o menos.
2. **Pygame en la feria:** se hace F1; funciona con internet.
3. **Hilos (T1):** no antes de la feria; se avisa que no están soportados.
4. **Celular:** los juegos de los equipos se juegan **solo en computador** (Chrome, Edge y Firefox); en el celular se muestra un aviso. El audio de iPhone deja de ser bloqueante.
5. **Correcciones:** F1–F8 en HU-40 (Camilo) e I1 en ARK-227 (Santiago).
6. **Entrega de los zips:** enlace de OneDrive o Drive en un formulario; la admin lo descarga y lo sube (TA-28).
