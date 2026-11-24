# Montaje de los videojuegos de los equipos (TA-28)

> **Audiencia:** Administradora de ARKAD, Scrum Master · **Actualizado:** 2026-11-16 · **Estado:** completo; probado en Arkad-test el 16-nov · **Fuente:** TA-28 (ARK-232 y ARK-234, Samuel Tilano), decisiones de Allison del 15 y 16-nov, [juegos web por motor](juegos-web-por-motor.md) (SP-03) y código de `dev` (back) del 16-nov.

Los equipos **no suben el zip**. Lo comparten como un enlace de su OneDrive o Drive, con permiso de lectura, en un formulario. La administradora lo descarga, lo revisa, lo sube a ARKAD y prueba «Jugar» en el computador. Los juegos se juegan **solo en computador** (Chrome, Edge o Firefox); en el celular se muestra un aviso, salvo los que la administradora marque con «Se puede jugar en celular» en Editar equipo → paso 3 (juegos con controles táctiles propios, TA-36).

## Antes de empezar
- **Límite:** 200 MB por zip; se recomienda 50 MB o menos, porque carga más rápido. Lo acepta el back desde HU-40 (ARK-226) y el nginx del API (210m, ARK-227).
- **Producción acepta 100 MB hasta el despliegue del 24-nov.** HU-40 se mezcla en `dev` y pasa a producción con el resto de las tareas del sprint, no antes (decisión de la Scrum Master, 16-nov). Hasta ese despliegue, los zips de más de 100 MB se revisan y se dejan listos, pero se suben en producción después del 24-nov. Los de 100 MB o menos se pueden subir antes.
- **Quién:** solo el rol Administrador sube zips. El registro de estudiantes no tiene ese paso.
- **Límite de subidas:** 3 zips cada 10 minutos por persona. Para montar muchos juegos, intercala la revisión (paso 2) con las subidas.

## Paso 1 · El equipo llena el formulario
El formulario (Microsoft Forms, ARK-235) pide el **nombre del equipo**, el **motor** (Unity, Godot, Pygame u otro) y el **enlace al zip**.
- El enlace debe abrir sin pedir cuenta: en OneDrive, «Cualquier persona con el vínculo puede ver»; en Drive, «Cualquier persona con el enlace · Lector».
- Si el enlace pide permiso, responde al equipo con el mensaje M1 (abajo).

## Paso 2 · Descargar y revisar el zip
Descárgalo y, **sin descomprimirlo en ARKAD**, ábrelo en el explorador de archivos para revisar esta lista:

| Revisa | Bien | Mal → qué hacer |
|---|---|---|
| Tamaño | 200 MB o menos (ideal ≤ 50 MB) | Más de 200 MB → M2 |
| Es un zip | Termina en `.zip` y abre | `.rar`, `.7z` o no abre → M3 |
| Archivo de entrada | Hay un `index.html` en la raíz o dentro de **una sola carpeta** (por ejemplo `BuildWebGl/index.html`) | Sin `index.html`, o varios `.html` y ninguno se llama `index.html` → M4 |
| Exportación del motor | Coincide con la tabla «Cómo reconocer el motor» | No coincide → el mensaje que indica la tabla |
| Basura de Mac | Sin carpeta `__MACOSX` (el back la ignora, pero conviene pedir que no venga) | — |
| Nombres | Archivos y carpetas sin espacios, tildes ni ñ | Con espacios o tildes, algunos archivos dan 404 hasta que se corrija F2 → M5 |
| Opciones web | Sin service worker propio (archivos como `index.service.worker.js` o `manifest.json` de PWA) | Abre igual, pero da errores en la consola; pedir que lo desactiven la próxima vez (M6, opcional) |

### Cómo reconocer el motor por los archivos
| Motor | Archivos que trae | Funciona en ARKAD |
|---|---|---|
| **Unity** (WebGL / Web) | `index.html`, carpeta `Build/` con `*.loader.js`, `*.data`, `*.framework.js` y `*.wasm`, y carpeta `TemplateData/` | Sí, si los archivos de `Build/` terminan en `.gz`, `.unityweb` o no tienen compresión. **No** si terminan en `.br` (Brotli sin «Decompression Fallback») → M7 |
| **Godot 4** | `index.html`, `index.js`, `index.wasm`, `index.pck` y `index.audio.worklet.js` | Sí, sin hilos. Abre `index.html` con el Bloc de notas y busca `GODOT_THREADS_ENABLED`: con `false` funciona; con `true` **no funciona** → M8 |
| **Pygame (pygbag)** | `index.html`, `<nombre>.apk` y `favicon.png` | Solo cuando esté la corrección F1 del front, y necesita internet: descarga unos 21 MB de pygbag cada vez que se abre |
| HTML5 / JavaScript | `index.html` con `.js` y recursos | Sí, con rutas relativas. Hasta F3, los `.svg` en imágenes y los `.mjs` no cargan |

## Paso 3 · Subir el zip
1. **Equipos Inscritos** → menú «⋮» del equipo → **Editar**.
2. «Siguiente» hasta el **paso 3 de 3** («Información adicional del proyecto»).
3. En **Archivo ZIP del proyecto**, elige el `.zip` y pulsa **Guardar cambios** (con 2 MB tarda unos 8 s; los grandes, más).

Si el back rechaza el archivo, el mensaje dice por qué:

| Mensaje | Qué pasa | Mensaje al equipo |
|---|---|---|
| «El archivo .zip está dañado o no se pudo leer…» | Zip dañado o cortado | M3 |
| «El archivo .zip no tiene un index.html…» | Sin ningún `.html` | M4 |
| 400 con la lista de los `.html` | Varios `.html` y ninguno es `index.html` | M4 |
| «El archivo supera el máximo de 200 MB.» | Muy grande | M2 |
| «El contenido del archivo no corresponde a un .zip» | No es un zip | M3 |

> Hasta que esté F8 del front, ante un archivo muy grande el registro puede mostrar «El tamaño máximo permitido es 500MB». El límite real es el del back.

## Paso 4 · Probar «Jugar» en el computador
1. Abre la página del juego y pulsa **Jugar** (`/play-game/<id>`). No hace falta iniciar sesión.
2. Espera: según el peso, tarda de 10 a 30 s.
3. El juego debe mostrar su pantalla de inicio y responder al clic o al teclado.

| Lo que ves | Causa probable | Mensaje |
|---|---|---|
| «Cross-Origin Isolation / SharedArrayBuffer missing» | Godot con hilos | M8 |
| «Unable to parse Build/…framework.js.br» | Unity con Brotli sin fallback | M7 |
| Pygame se queda en «Loading, please wait…» | Falta F1 del front | Esperar F1; no es culpa del equipo |
| Se queda en «Cargando archivos del juego…» más de 1 minuto | Zip que no abre en el navegador (hasta F4 no hay mensaje de error) | Revisar el paso 2; si todo está bien, avisar a Backend |
| Pantalla negra, pero responde a las teclas | Juego que espera un clic o una tecla | Es normal |

## Paso 5 · Anotar el resultado y avisar al equipo
Anota cada juego en la hoja de seguimiento: **equipo · motor · peso · fecha de montaje · ¿abre? (sí / no) · mensaje enviado**. Si no abre, envía el mensaje que corresponda:

- **M1 · Enlace sin acceso:** «El enlace pide permiso. Cámbialo a "Cualquier persona con el vínculo puede ver" y vuelve a enviarlo.»
- **M2 · Muy grande:** «El zip pesa más de 200 MB. Quita archivos que no usa el juego o comprime los recursos (texturas, audio en OGG) y vuelve a exportar.»
- **M3 · Zip dañado o formato distinto:** «El archivo está dañado o no es un .zip. Vuelve a comprimir la carpeta exportada en formato .zip.»
- **M4 · Sin `index.html`:** «Comprime el contenido de la carpeta exportada, con `index.html` en la raíz. Si tu motor genera otro nombre (por ejemplo `MiJuego.html`), cámbialo a `index.html`.»
- **M5 · Nombres con espacios o tildes:** «Cambia los nombres de archivos y carpetas para que no tengan espacios, tildes ni ñ, y vuelve a exportar.»
- **M6 · PWA activada (opcional):** «Tu exportación incluye un service worker o PWA; desactívalo la próxima vez que exportes.»
- **M7 · Unity con Brotli:** «En Player Settings → Publishing Settings usa Compression Format: Gzip, o activa Decompression Fallback, y vuelve a exportar.»
- **M8 · Godot con hilos:** «Exporta con la plantilla Web y Thread Support desactivado (Godot 4.3 o superior) y vuelve a exportar.»

## Prueba de los 6 juegos con zip en producción (16-nov)
Abiertos con «Jugar» en `https://arkad.openlab.uninorte.edu.co`, sin sesión, con el front de producción del 16-nov (antes de F1–F8). Probado con Playwright en Chrome, Edge y Firefox de escritorio.

| Juego (id) | Motor | Zip | Chrome | Edge | Firefox | Observaciones |
|---|---|---|---|---|---|---|
| Break the Cycle (144) | Unity | 173 MB | Abre (25 s) | Abre (24 s) | Abre (28 s) | El más pesado; entrada `BuildWebGl/index.html` |
| Digital Watchman (200) | Unity | 153 MB | Abre (21 s) | Abre (22 s) | Abre (24 s) | Entrada `DigitalVigilante-WebBuild/index.html` |
| Ecos del Aula (197) | Unity (Gzip) | 110 MB | Abre (16 s) | Abre (15 s) | Abre (19 s) | — |
| Shadow of the Words (185) | Godot | 88 MB | Abre (17 s) | Abre (16 s) | Abre (16 s) | Aviso de Godot en consola por las partículas (no afecta) |
| Desencaje (214) | Unity | 50 MB | Abre (10 s) | Abre (11 s) | Abre (11 s) | — |
| What happened to Alex (228) | Godot | 23 MB | Abre (8 s) | Abre (9 s) | Abre (8 s) | Trae service worker de PWA (404 en la consola); el juego abre igual |

- Los tiempos van desde abrir `/play-game/<id>` hasta ver el juego, en la red de la casa. En el wifi de la feria serán mayores.
- Los errores 401 y de WebSocket en la consola son normales sin sesión.
- **Tres juegos pasan de 100 MB.** Si alguno se vuelve a subir en producción antes del despliegue del 24-nov, el back lo rechaza (ver «Antes de empezar»).

## Prueba del procedimiento en Arkad-test (16-nov)
Con `godot-sin-hilos.zip` (material de SP-03) en el equipo «QA-Samuel Equipo 1»:
- Pasos 2 y 3: zip revisado y subido (`POST /upload/zip` 201 y luego `PATCH /teams/654` 200) en unos 8 s.
- Paso 4: «Jugar» abrió el juego en 9 s, sin sesión.

## Relacionado
- [Juegos web por motor](juegos-web-por-motor.md): resultados por motor, riesgos e instrucciones para los equipos.
- [Equipos y verificación](equipos-y-verificacion.md).
- Tickets: HU-40 (ARK-224), TA-28 (ARK-232) y TA-23 (instructivo).
