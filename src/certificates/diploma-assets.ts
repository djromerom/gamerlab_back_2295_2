import fs from 'fs/promises';
import path from 'path';

/**
 * ARK-309: fuentes e imágenes de los diplomas, incrustadas en el HTML como `data:`.
 * Gotenberg recibe solo el HTML (sin carpeta de archivos) y así el diploma no depende de enlaces
 * temporales de Azure ni de que Google Fonts responda en el momento de generar el PDF.
 */
const ASSETS_DIR = path.join(__dirname, 'assets');

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';

/** Fuentes variables de Google Fonts (licencia OFL): un archivo cubre todos los pesos. */
const FONTS = [
  {
    family: 'Unbounded',
    file: 'unbounded-latin.woff2',
    weight: '200 900',
    range: LATIN,
  },
  {
    family: 'Nunito',
    file: 'nunito-latin.woff2',
    weight: '200 1000',
    range: LATIN,
  },
  {
    family: 'Nunito',
    file: 'nunito-latin-ext.woff2',
    weight: '200 1000',
    range: LATIN_EXT,
  },
  {
    family: 'JetBrains Mono',
    file: 'jetbrains-mono-latin.woff2',
    weight: '100 800',
    range: LATIN,
  },
  {
    family: 'JetBrains Mono',
    file: 'jetbrains-mono-latin-ext.woff2',
    weight: '100 800',
    range: LATIN_EXT,
  },
] as const;

const IMAGES = {
  uninorte: 'uninorte-logo.png',
  arkad: 'arkad-logo.png',
  signatureDaladier: 'firma-daladier.png',
  signatureDaniel: 'firma-daniel.png',
  medalGold: 'medalla-oro.png',
  medalSilver: 'medalla-plata.png',
  medalBronze: 'medalla-bronce.png',
} as const;

export type DiplomaImage = keyof typeof IMAGES;

export interface DiplomaAssets {
  /** `@font-face` con las fuentes incrustadas. */
  fontsCss: string;
  /** `data:image/png;base64,...` por imagen. */
  images: Record<DiplomaImage, string>;
}

let cached: Promise<DiplomaAssets> | null = null;

async function readAll(): Promise<DiplomaAssets> {
  const fontFaces = await Promise.all(
    FONTS.map(async (font) => {
      const data = await fs.readFile(path.join(ASSETS_DIR, 'fonts', font.file));
      return `@font-face { font-family: '${font.family}'; font-style: normal; font-weight: ${font.weight}; src: url(data:font/woff2;base64,${data.toString('base64')}) format('woff2'); unicode-range: ${font.range}; }`;
    }),
  );
  const entries = await Promise.all(
    (Object.entries(IMAGES) as [DiplomaImage, string][]).map(
      async ([key, file]) => {
        const data = await fs.readFile(path.join(ASSETS_DIR, 'img', file));
        return [
          key,
          `data:image/png;base64,${data.toString('base64')}`,
        ] as const;
      },
    ),
  );
  return {
    fontsCss: fontFaces.join('\n'),
    images: Object.fromEntries(entries) as Record<DiplomaImage, string>,
  };
}

/** Se leen del disco una sola vez; si falla, el siguiente PDF lo vuelve a intentar. */
export function loadDiplomaAssets(): Promise<DiplomaAssets> {
  if (!cached) {
    cached = readAll().catch((error: unknown) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}
