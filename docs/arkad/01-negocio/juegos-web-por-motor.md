# Juegos web por motor: qué funciona en ARKAD (SP-03)

> **Audiencia:** todo el equipo, Scrum Master (instructivo TA-23) · **Actualizado:** 2026-11-15 · **Estado:** parcial (escritorio verificado; celulares pendientes de la prueba en Arkad-test) · **Fuente:** SP-03 (ARK-38, Samuel Tilano): código de `origin/dev` (back) y `origin/dev-deploy` (front) del 15-nov, builds reales probados con el `public/sw.js` real.

## Cómo se juega un juego hoy
1. **Subida:** el administrador sube un `.zip` en Gestión de equipos (`POST /upload/zip`). El back acepta hasta **100 MB**, revisa que sea un zip real y elige el archivo de entrada (`index.html`).
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
- **Celulares (Chrome Android, Safari iPhone) y la PWA de jurado:** > PENDIENTE: prueba en Arkad-test con los mismos zips (memoria con juegos de 60 a 100 MB y audio en Safari).

## Riesgos R1–R6

| Riesgo | Veredicto | Evidencia |
|---|---|---|
| **R1** Unity con Brotli no carga | **Confirmado** solo sin «Decompression Fallback». Gzip, el fallback y sin compresión funcionan. | El SW entrega los `.br` sin descomprimir ni `Content-Encoding` (`sw.ts:126`); error «Unable to parse …framework.js.br» en los 4 navegadores. |
| **R2** pygbag bloqueado por COEP | **Confirmado: hoy no carga en ningún navegador.** Con F1 carga en los 4. Necesita internet (21 MB del CDN por carga). | Chrome: `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`; Firefox y WebKit: bloqueo por CORP de `pygame-web.github.io`. |
| **R3** Godot con hilos | **Confirmado: no funciona.** Godot sin hilos funciona en todos. | La página padre no envía COOP/COEP (`nginx.conf`; cabeceras de Arkad-test revisadas el 15-nov); Godot muestra «Cross-Origin Isolation – SharedArrayBuffer missing». |
| **R4** Memoria y SW detenido | **Confirmado en parte.** Con el SW detenido, el juego abierto sigue respondiendo, pero cualquier archivo que pida después o una recarga reciben el `index.html` de ARKAD. La memoria en celular queda por medir. | Prueba con el SW detenido (Chrome y Edge, Godot y Unity); `sw.ts:114-117`. Correcciones F5 y F6. |
| **R5** Tipos de archivo | **Confirmado en parte.** Fallan `.svg` en `<img>`, `.mjs` y los nombres con espacios o tildes. wav, ttf, css, gif y webp funcionan. | Sonda de tipos en los 4 navegadores; `sw.ts:170-195`. Correcciones F2 y F3. |
| **R6** Actualización de la PWA | **Descartado por el código:** una versión nueva del SW espera a que se cierren las pestañas (no hay `skipWaiting`). Riesgo residual: un juego exportado con PWA registraría su propio SW; las instrucciones lo prohíben. | `sw.ts` sin `install`/`skipWaiting`; `PwaUpdateNotice.tsx:70-74`. |

## Instrucciones para los equipos (para el instructivo TA-23)

**Para todos**
- Entrega **un solo .zip** de **máximo 100 MB**. Recomendado: **menos de 50 MB**, porque los jurados pueden jugar en celular.
- El zip debe tener `index.html` **en la raíz**: comprime el **contenido** de la carpeta exportada, no la carpeta. Si tu exportación genera otro nombre (`MiJuego.html`), cámbialo a `index.html`.
- Nombres de archivos y carpetas **sin espacios, tildes ni ñ** (`musica_fondo.ogg`, no `Música Fondo.ogg`). Respeta mayúsculas y minúsculas.
- En Mac, borra la carpeta `__MACOSX` o comprime desde la terminal: `cd build && zip -r ../juego.zip . -x "__MACOSX/*" -x "*.DS_Store"`.
- **No** actives opciones de PWA, service worker ni «offline» en la exportación.
- Imágenes en PNG, JPG, GIF o WEBP; **no uses SVG** ni scripts `.mjs` hasta que se corrija F3.

**Unity (WebGL / Web)**
- Player Settings → Publishing Settings → **Compression Format: Gzip** (o *Disabled*). Si usas Brotli, activa **Decompression Fallback**.
- No cambies el nombre de la carpeta `Build/`.
- Deja desactivado el multihilo (Unity 6: *Native C/C++ Multithreading*).
- Sube el **contenido** de la carpeta de salida: `index.html`, `Build/`, `TemplateData/` y `StreamingAssets/` si existe.

**Godot 4 (4.3 o superior)**
- Exporta con la plantilla Web y **Thread Support desactivado** (el valor por defecto desde 4.3). **No** actives *Progressive Web App*.
- Exporta con el nombre `index.html` (o renómbralo).
- Los proyectos en **C#** no se pueden exportar a web con Godot 4: usa GDScript.

**Pygame (pygbag)** — *solo después de que se despliegue la corrección F1; antes no carga.*
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
| Más de 100 MB | 413 «El archivo supera el máximo de 100 MB.» (antes: «File too large») |
| Sin ningún `.html` | 400 «El archivo .zip no tiene un index.html. Comprime el contenido de la carpeta exportada del juego, con index.html en la raíz.» |
| Varios `.html` y ninguno `index.html` | 400 que lista los `.html` encontrados y pide renombrar el que abre el juego |
| `index.html` en una subcarpeta | Se acepta: se usa el `index.html` más cercano a la raíz |
| Basura de macOS (`__MACOSX/._index.html`) | Se ignora (antes podía quedar como entrada y el juego no abría) |
| `JUEGO.ZIP` en mayúsculas o enviado como `application/octet-stream` | Se acepta y se revisa igual |
| Archivo que no es zip | 400 «El contenido del archivo no corresponde a un .zip» |

## Correcciones
Tamaño: XS < 1 h, S ≈ medio día, M ≈ 1–2 días.

| # | Dónde | Cambio | Responsable | Tamaño | Estado |
|---|---|---|---|---|---|
| **F1** | front `src/sw.ts:152` (+ recompilar `public/sw.js`) | COEP del iframe: `require-corp` → `credentialless`. Sin esto **pygbag no carga** (el CDN de pygbag no envía `Cross-Origin-Resource-Policy`). Hoy no aporta nada, porque la página padre no está aislada. | Frontend | XS | Pendiente (antes de la mini feria del 19) |
| F2 | front `sw.ts:109-112` | `decodeURIComponent` de la ruta: archivos con espacios o tildes dan 404 | Frontend | XS | Pendiente |
| F3 | front `sw.ts:175-184` | Tabla de tipos MIME: svg, mjs, gif, webp, mp3, ogg, wav, woff2, ttf… (`.svg` en `<img>` y `.mjs` fallan) | Frontend | XS | Pendiente |
| F4 | front `sw.ts:68-90`, `useGameLoader.ts` | Error visible si el zip no se puede abrir (hoy queda «Cargando archivos del juego...» para siempre) | Frontend | S | Después del 19 |
| F5 | front `sw.ts:114-117` | Si el SW se detiene, el juego recibe el `index.html` de ARKAD: responder 404 o guardar en Cache Storage | Frontend | S / M | Después del 19 |
| F6 | front `sw.ts:87` | Liberar de memoria los juegos anteriores | Frontend | XS | Después del 19 |
| F7 | front `GamePlayerPage.tsx:55-58` | `allow="fullscreen; autoplay; gamepad"` en el iframe (pantalla completa) | Frontend | XS | Pendiente |
| F8 | front `azureFile.ts:76`, `TeamWizardDialog.tsx:557-559` | Mostrar y validar el límite real de 100 MB (hoy dice 500 MB) | Frontend | XS | Pendiente |
| B1 | back `azure-storage.service.ts` | Zip dañado: 400 en español | Backend (Samuel) | XS | Hecho en `fix/ARK-38-zip-upload-errors` |
| B2 | back `zip-entry.logic.ts` | Entrada: `index.html` más cercano a la raíz, ignorar `__MACOSX` y ocultos, mayúsculas | Backend (Samuel) | S | Hecho en `fix/ARK-38-zip-upload-errors` |
| B3 | back `multer-exception.filter.ts` | 413 en español con el límite | Backend (Samuel) | XS | Hecho en `fix/ARK-38-zip-upload-errors` |
| B4 | back `upload.controller.ts` | Aceptar `.zip` enviado como `application/octet-stream` | Backend (Samuel) | XS | Hecho en `fix/ARK-38-zip-upload-errors` |
| I1 | infra | Confirmar `client_max_body_size` del nginx del API (test y producción) ≥ 100 MB | DevOps (Santiago) | XS | Pendiente |
| T1 | front `nginx.conf` | Hilos (Godot o Unity con hilos): COOP/COEP en la página padre. Afecta popups e inicio de sesión. | Frontend + DevOps | M | **No antes de la feria**: hilos no soportados |

## Límite de tamaño
**Decisión: 100 MB como máximo y recomendación de 50 MB o menos.** No cambia el back. Falta que el registro lo muestre igual (F8) y que el nginx del API lo permita (I1).

| Opción | A favor | En contra |
|---|---|---|
| **100 MB máximo, recomendar ≤ 50 MB** (elegida) | Sin cambios de infraestructura; alcanza para Godot, pygbag y la mayoría de Unity con Gzip | Un juego de 100 MB puede no abrir en un celular de gama media |
| Bajar a 50 MB | Menos riesgo de memoria | Puede excluir juegos de Unity a una semana del cierre de inscripciones |
| Subir a 200–500 MB | Nadie queda por fuera | RAM del back en cada subida, nginx, celulares y wifi de la feria: no recomendado |

## Quién sube el zip
Hoy solo el **Administrador** sube zips (Gestión de equipos → `TeamWizardDialog`); el registro de estudiantes no tiene ese paso. > A CONFIRMAR con la Scrum Master: cómo entregan los equipos su zip (correo, Drive) antes del 22-nov.
