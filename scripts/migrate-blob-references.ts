/**
 * Task 28 (SP1): convierte las URL firmadas guardadas en la BD (logo y archivo del juego) en
 * referencias `upload:<id>`; la API firma una URL de 1 h al leer (BlobReferenceService).
 *
 * Tablas y columnas: videojuegos.logo_url / archivo_videojuego_url / imagenes_adicionales y las
 * mismas columnas de los videojuegos historicos (modelos Videogame y HistoricalVideogame).
 *
 * Por defecto NO escribe nada (dry-run): imprime que cambiaria y cuantas filas quedan sin
 * resolver. Para aplicar los cambios:
 *
 *   npx ts-node -T scripts/migrate-blob-references.ts --apply
 *
 * Variables: DATABASE_URL (la de la API), AZURE_CONTAINER y AZURE_ACCOUNT_NAME (las mismas del .env
 * de la API), o bien --container-url=<url base del contenedor>.
 *
 * Es idempotente: se puede repetir; ignora lo que ya es `upload:<id>`, lo que no es una URL
 * firmada y las URL cuyo blob no existe en la tabla de archivos subidos (quedan como estaban y
 * se listan al final). Hacer un respaldo de la BD antes de aplicar.
 */
import { PrismaClient } from '@prisma/client';
import { blobNameFromSignedUrl, BLOB_REF_PREFIX } from '../src/upload/blob-reference.service';

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();
const container = process.env.AZURE_CONTAINER;

/**
 * URL base de nuestro contenedor (solo las URL de este origen y ruta se convierten; el resto son
 * externas y quedan intactas). Produccion: https://<AZURE_ACCOUNT_NAME>.blob.core.windows.net/<container>.
 * Se puede forzar con --container-url=<url>. En desarrollo (Azurite) tambien se acepta
 * http://localhost:10000/<cuenta>/<container>.
 */
function containerUrls(): string[] {
  const arg = process.argv.find((a) => a.startsWith('--container-url='));
  if (arg) return [arg.slice('--container-url='.length)];
  if (!container) throw new Error('Falta AZURE_CONTAINER (o --container-url=...)');
  const urls: string[] = [];
  const account =
    process.env.AZURE_ACCOUNT_NAME ?? /AccountName=([^;]+)/.exec(process.env.AZURE_STORAGE_CONNECTION_STRING ?? '')?.[1];
  if (process.env.AZURE_ACCOUNT_NAME) urls.push(`https://${process.env.AZURE_ACCOUNT_NAME}.blob.core.windows.net/${container}`);
  if (process.env.NODE_ENV === 'development' && account) urls.push(`http://localhost:10000/${account}/${container}`);
  if (urls.length === 0) throw new Error('Falta AZURE_ACCOUNT_NAME (o --container-url=...)');
  return urls;
}
const OWN_URLS = containerUrls();

type Row = { id: number; logoUrl: string | null; gameFileUrl: string | null; additionalImages: string[] };
type Changes = { logoUrl?: string; gameFileUrl?: string; additionalImages?: string[] };
type Target = {
  label: string;
  list: () => Promise<Row[]>;
  update: (id: number, data: Changes) => Promise<unknown>;
};
const SELECT = { id: true, logoUrl: true, gameFileUrl: true, additionalImages: true } as const;

const targets: Target[] = [
  {
    label: 'Videogame',
    list: () => prisma.videogame.findMany({ select: SELECT }),
    update: (id, data) => prisma.videogame.update({ where: { id }, data }),
  },
  {
    label: 'HistoricalVideogame',
    list: () => prisma.historicalVideogame.findMany({ select: SELECT }),
    update: (id, data) => prisma.historicalVideogame.update({ where: { id }, data }),
  },
];

const uploadIdByBlob = new Map<string, string | null>();
async function toReference(value: string | null): Promise<string | null> {
  if (!value || value.startsWith(BLOB_REF_PREFIX)) return null;
  const blobName = blobNameFromSignedUrl(value, OWN_URLS);
  if (!blobName) return null;
  if (!uploadIdByBlob.has(blobName)) {
    const up = await prisma.upload.findFirst({ where: { blobName }, select: { id: true } });
    uploadIdByBlob.set(blobName, up?.id ?? null);
  }
  const id = uploadIdByBlob.get(blobName);
  return id ? `${BLOB_REF_PREFIX}${id}` : null;
}

function isUnresolvedUrl(v: string | null): boolean {
  return !!v && !v.startsWith(BLOB_REF_PREFIX) && /^https?:\/\//.test(v);
}

async function main() {
  console.log(apply ? 'MODO APLICAR: se escribira en la BD' : 'DRY-RUN: no se escribe nada (usar --apply)');
  let converted = 0;
  const unresolved: string[] = [];

  for (const t of targets) {
    for (const row of await t.list()) {
      const data: Changes = {};
      for (const field of ['logoUrl', 'gameFileUrl'] as const) {
        const current = row[field];
        const ref = await toReference(current);
        if (ref) data[field] = ref;
        else if (isUnresolvedUrl(current)) unresolved.push(`${t.label} #${row.id} ${field}`);
      }
      // imagenes adicionales: se convierte cada elemento; el arreglo se reescribe solo si cambio alguno
      let imagesConverted = 0;
      const images: string[] = [];
      for (let i = 0; i < row.additionalImages.length; i++) {
        const img = row.additionalImages[i];
        const ref = await toReference(img);
        if (ref) imagesConverted++;
        else if (isUnresolvedUrl(img)) unresolved.push(`${t.label} #${row.id} additionalImages[${i}]`);
        images.push(ref ?? img);
      }
      if (imagesConverted > 0) data.additionalImages = images;
      if (Object.keys(data).length === 0) continue;
      converted += (data.logoUrl ? 1 : 0) + (data.gameFileUrl ? 1 : 0) + imagesConverted;
      console.log(`${t.label} #${row.id}:`, data);
      if (apply) await t.update(row.id, data);
    }
  }

  console.log(`\nCampos ${apply ? 'convertidos' : 'por convertir'}: ${converted}`);
  console.log(`Campos con URL que no es una URL firmada de un archivo subido (externas, sin firma o blob borrado; sin cambios): ${unresolved.length}`);
  unresolved.forEach((u) => console.log('  -', u));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
