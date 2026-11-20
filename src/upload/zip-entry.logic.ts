/**
 * SP-03 (ARK-38): qué archivo del .zip abre el reproductor de juegos. Lógica pura, sin JSZip ni
 * Nest, para probarla con listas de nombres.
 *
 * - Se ignoran carpetas, la basura de macOS (`__MACOSX/`) y los archivos ocultos (`.DS_Store`,
 *   `._index.html`): antes podían quedar como entrada y el juego no abría.
 * - Gana el `index.html` (sin distinguir mayúsculas) más cercano a la raíz; a igual profundidad,
 *   por orden alfabético. Antes servía cualquier nombre que terminara en `index.html`.
 * - Sin `index.html`, si hay un solo `.html` se usa ese (exportaciones de Godot como `MiJuego.html`).
 * - Sin `index.html` y con varios `.html` no se adivina: el equipo debe decir cuál abre el juego.
 */

/**
 * Peso máximo del .zip de un juego, igual en el back, el registro y las instrucciones (SP-03).
 * HU-40 (ARK-226): sube de 100 a 200 MB; el nginx del API acepta 210m (ARK-227).
 */
export const MAX_ZIP_SIZE_MB = 200;
export const MAX_ZIP_SIZE_BYTES = MAX_ZIP_SIZE_MB * 1024 * 1024;

/** Cuántos nombres de .html se muestran en el mensaje de error. */
const MAX_LISTED = 5;

export type ZipEntryResult =
  | { ok: true; entry: string }
  | { ok: false; message: string };

/**
 * Partes de la ruta sin los segmentos `.` ni vacíos: `./index.html` y `web//./index.html` cuentan
 * como `index.html` y `web/index.html` (revisión de Santiago en #293: el `.` se tomaba como oculto).
 */
const segments = (name: string) =>
  name.split('/').filter((part) => part !== '' && part !== '.');
const baseName = (name: string) => name.split('/').pop() ?? name;
const depth = (name: string) => segments(name).length - 1;

/** Archivos que no son del juego: carpetas, basura de macOS y ocultos. */
export function isIgnoredZipPath(name: string): boolean {
  if (name.endsWith('/')) return true;
  const parts = segments(name);
  if (parts.includes('__MACOSX')) return true;
  return parts.some((part) => part.startsWith('.'));
}

const isHtml = (name: string) => baseName(name).toLowerCase().endsWith('.html');

export function pickZipEntry(names: string[]): ZipEntryResult {
  const htmlFiles = names.filter(
    (name) => !isIgnoredZipPath(name) && isHtml(name),
  );
  if (htmlFiles.length === 0) {
    return {
      ok: false,
      message:
        'El archivo .zip no tiene un index.html. Comprime el contenido de la carpeta exportada del juego, con index.html en la raíz.',
    };
  }

  const byDepthThenName = (a: string, b: string) =>
    depth(a) - depth(b) || a.localeCompare(b);
  const [index] = htmlFiles
    .filter((name) => baseName(name).toLowerCase() === 'index.html')
    .sort(byDepthThenName);
  if (index) return { ok: true, entry: index };
  if (htmlFiles.length === 1) return { ok: true, entry: htmlFiles[0] };

  const listed = [...htmlFiles].sort(byDepthThenName).slice(0, MAX_LISTED);
  const more = htmlFiles.length > MAX_LISTED ? '…' : '';
  return {
    ok: false,
    message: `El archivo .zip tiene varios .html y ninguno se llama index.html (${listed.join(', ')}${more}). Renombra a index.html el que abre el juego.`,
  };
}
