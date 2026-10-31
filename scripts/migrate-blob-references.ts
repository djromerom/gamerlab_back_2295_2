/**
 * Task 28 (SP1): convierte las URL firmadas guardadas en la BD (logo y archivo del juego) en
 * referencias `upload:<id>`; la API firma una URL de 1 h al leer (BlobReferenceService).
 *
 * Tablas y columnas: videojuegos.logo_url / archivo_videojuego_url y las mismas columnas de los
 * videojuegos historicos (modelos Videogame y HistoricalVideogame).
 *
 * Por defecto NO escribe nada (dry-run): imprime que cambiaria y cuantas filas quedan sin
 * resolver. Para aplicar los cambios:
 *
 *   npx ts-node -T scripts/migrate-blob-references.ts --apply
 *
 * Variables: DATABASE_URL (la de la API) y AZURE_CONTAINER (nombre del contenedor, el mismo del
 * .env de la API; si falta se toma el ultimo segmento de la ruta, valido porque los blobName no
 * llevan "/").
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

type Target = {
  label: string;
  list: () => Promise<{ id: number; logoUrl: string | null; gameFileUrl: string | null }[]>;
  update: (id: number, data: { logoUrl?: string; gameFileUrl?: string }) => Promise<unknown>;
};

const targets: Target[] = [
  {
    label: 'Videogame',
    list: () => prisma.videogame.findMany({ select: { id: true, logoUrl: true, gameFileUrl: true } }),
    update: (id, data) => prisma.videogame.update({ where: { id }, data }),
  },
  {
    label: 'HistoricalVideogame',
    list: () => prisma.historicalVideogame.findMany({ select: { id: true, logoUrl: true, gameFileUrl: true } }),
    update: (id, data) => prisma.historicalVideogame.update({ where: { id }, data }),
  },
];

const uploadIdByBlob = new Map<string, string | null>();
async function toReference(value: string | null): Promise<string | null> {
  if (!value || value.startsWith(BLOB_REF_PREFIX)) return null;
  const blobName = blobNameFromSignedUrl(value, container);
  if (!blobName) return null;
  if (!uploadIdByBlob.has(blobName)) {
    const up = await prisma.upload.findFirst({ where: { blobName }, select: { id: true } });
    uploadIdByBlob.set(blobName, up?.id ?? null);
  }
  const id = uploadIdByBlob.get(blobName);
  return id ? `${BLOB_REF_PREFIX}${id}` : null;
}

async function main() {
  console.log(apply ? 'MODO APLICAR: se escribira en la BD' : 'DRY-RUN: no se escribe nada (usar --apply)');
  let converted = 0;
  const unresolved: string[] = [];

  for (const t of targets) {
    for (const row of await t.list()) {
      const data: { logoUrl?: string; gameFileUrl?: string } = {};
      for (const field of ['logoUrl', 'gameFileUrl'] as const) {
        const current = row[field];
        const ref = await toReference(current);
        if (ref) data[field] = ref;
        else if (current && !current.startsWith(BLOB_REF_PREFIX) && /^https?:\/\//.test(current)) {
          unresolved.push(`${t.label} #${row.id} ${field}`);
        }
      }
      if (Object.keys(data).length === 0) continue;
      converted += Object.keys(data).length;
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
  .finally(() => prisma.$disconnect());
