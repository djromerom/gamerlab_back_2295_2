import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AzureStorageService } from './azure-storage.service';

/** Prefijo de lo que se guarda en la BD en lugar de una URL firmada: `upload:<uuid del archivo>`. */
export const BLOB_REF_PREFIX = 'upload:';
/** Vigencia de las URL firmadas que se entregan en las respuestas. */
export const READ_URL_TTL_SEC = 3600;
/** Una misma URL firmada se reutiliza este tiempo para no firmar en cada petición (home). */
const SIGN_CACHE_MS = 5 * 60_000;
const SIGN_CACHE_MAX = 2000;

/**
 * Task 28: la BD guarda la referencia al archivo (`upload:<id>`) y la URL firmada se genera al leer.
 * Los datos viejos (URL completa ya guardada) se siguen sirviendo tal cual hasta que el script
 * `scripts/migrate-blob-references.ts` los convierta.
 */
/**
 * Nombre del blob de una URL firmada de nuestro contenedor, o null si no es una URL firmada
 * (se exige `sig`: nadie puede referenciar un archivo privado conociendo solo su nombre).
 * Lo usa tambien scripts/migrate-blob-references.ts.
 */
export function blobNameFromSignedUrl(value: string, container?: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!parsed.searchParams.has('sig')) return null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  const at = container ? segments.indexOf(container) : -1;
  const blobSegments = at >= 0 ? segments.slice(at + 1) : segments.slice(-1);
  if (blobSegments.length === 0) return null;
  try {
    return blobSegments.map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}

type BlobFields = { logoUrl?: string | null; gameFileUrl?: string | null; additionalImages?: string[] | null };

@Injectable()
export class BlobReferenceService {
  private readonly cache = new Map<string, { url: string | null; until: number }>();

  constructor(
    private readonly azure: AzureStorageService,
    private readonly prisma: PrismaService,
  ) {}

  static isReference(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(BLOB_REF_PREFIX);
  }

  /** Referencia -> URL firmada de 1 h (con caché de 5 min). Cualquier otro valor pasa sin cambios. */
  async resolve<T extends string | null | undefined>(value: T): Promise<T | string | null> {
    if (!BlobReferenceService.isReference(value)) return value;
    const id = value.slice(BLOB_REF_PREFIX.length);
    const now = Date.now();
    const hit = this.cache.get(id);
    if (hit && hit.until > now) return hit.url;

    const signed = await this.azure.signReadUrlById(id, READ_URL_TTL_SEC);
    const url = signed?.url ?? null;
    if (this.cache.size >= SIGN_CACHE_MAX) this.cache.clear();
    this.cache.set(id, { url, until: now + SIGN_CACHE_MS });
    return url;
  }

  /** Copia del videojuego con `logoUrl` y `gameFileUrl` resueltos (solo los campos presentes). */
  async resolveVideogame<T extends BlobFields | null | undefined>(vg: T): Promise<T> {
    if (!vg) return vg;
    const out: BlobFields = { ...vg };
    await this.resolveFields(out);
    return out as T;
  }

  /** Resuelve `logoUrl` / `gameFileUrl` de una lista de videojuegos, editandolos en el lugar (resultados frescos de Prisma). */
  async resolveInPlace<T extends BlobFields>(list: T[]): Promise<T[]> {
    await Promise.all(list.map((vg) => (vg ? this.resolveFields(vg) : undefined)));
    return list;
  }

  private async resolveFields(vg: BlobFields): Promise<void> {
    if ('logoUrl' in vg) vg.logoUrl = await this.resolve(vg.logoUrl);
    if ('gameFileUrl' in vg) vg.gameFileUrl = await this.resolve(vg.gameFileUrl);
    if (Array.isArray(vg.additionalImages)) {
      const signed = await Promise.all(vg.additionalImages.map((img) => this.resolve(img)));
      // una imagen cuyo archivo ya no existe se omite en vez de devolver null
      vg.additionalImages = signed.filter((u): u is string => !!u);
    }
  }

  /** Resuelve las claves indicadas de filas planas (p. ej. vista del ranking: logoUrl, videogameLogoUrl). */
  async resolveKeys<T extends Record<string, any>>(rows: T[], keys: string[]): Promise<T[]> {
    return Promise.all(
      rows.map(async (r) => {
        if (!r) return r;
        const out: Record<string, any> = { ...r };
        for (const k of keys) if (k in out) out[k] = await this.resolve(out[k]);
        return out as T;
      }),
    );
  }

  /** Aplica `resolveVideogame` al `videogame` anidado de cada equipo. */
  async resolveTeamsVideogames<T extends { videogame?: BlobFields | null }>(teams: T[]): Promise<T[]> {
    return Promise.all(
      teams.map(async (t) => (t?.videogame ? { ...t, videogame: await this.resolveVideogame(t.videogame) } : t)),
    );
  }

  /**
   * URL firmada de uno de nuestros blobs -> `upload:<id>`. Se exige la firma (`sig`) para que
   * nadie pueda referenciar un archivo privado conociendo solo su nombre. Si no corresponde a
   * ningún upload (URL externa, dato raro), el valor se devuelve sin cambios.
   */
  async toReference<T extends string | null | undefined>(value: T): Promise<T | string> {
    if (typeof value !== 'string' || value === '' || BlobReferenceService.isReference(value)) return value;
    const blobName = blobNameFromSignedUrl(value, process.env.AZURE_CONTAINER);
    if (!blobName) return value;
    const upload = await this.prisma.upload.findFirst({ where: { blobName }, select: { id: true } });
    return upload ? `${BLOB_REF_PREFIX}${upload.id}` : value;
  }

  /** Convierte `logoUrl` y `gameFileUrl` de un DTO de escritura a referencias (solo los presentes). */
  async referenceVideogameFields<T extends BlobFields>(dto: T): Promise<T> {
    if (!dto) return dto;
    const out: BlobFields = { ...dto };
    if (typeof out.logoUrl === 'string') out.logoUrl = await this.toReference(out.logoUrl);
    if (typeof out.gameFileUrl === 'string') out.gameFileUrl = await this.toReference(out.gameFileUrl);
    if (Array.isArray(out.additionalImages)) {
      out.additionalImages = await Promise.all(out.additionalImages.map((img) => this.toReference(img)));
    }
    return out as T;
  }
}
