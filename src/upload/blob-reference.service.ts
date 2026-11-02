import { BadRequestException, Injectable } from '@nestjs/common';
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
 * Nombre del blob de una URL firmada de NUESTRO contenedor, o null. Se exige la firma (`sig`) y que
 * origen y ruta coincidan con alguna de las URL base del contenedor; una URL de otro host es
 * externa y queda intacta. Lo usa tambien scripts/migrate-blob-references.ts.
 */
export function blobNameFromSignedUrl(value: string, containerUrls: string[]): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!parsed.searchParams.has('sig')) return null;
  for (const base of containerUrls) {
    let b: URL;
    try {
      b = new URL(base);
    } catch {
      continue;
    }
    const prefix = b.pathname.replace(/\/+$/, '') + '/';
    if (parsed.origin !== b.origin || !parsed.pathname.startsWith(prefix)) continue;
    const rest = parsed.pathname.slice(prefix.length);
    if (!rest) return null;
    try {
      return rest.split('/').map(decodeURIComponent).join('/');
    } catch {
      return null;
    }
  }
  return null;
}

/** Ventana en la que un archivo recien subido puede referenciarse aunque aun no sea publico (igual que upload-urls-y-zip). */
export const FRESH_UPLOAD_WINDOW_MS = 15 * 60_000;

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
        const out: Record<string, unknown> = { ...r };
        for (const k of keys) if (k in out) out[k] = await this.resolve(out[k] as string | null);
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

  private async findUpload(where: { id: string } | { blobName: string }) {
    return this.prisma.upload.findFirst({ where, select: { id: true, isPublic: true, createdAt: true } });
  }

  /** Referencia a la que apunta un valor (referencia o URL firmada propia) sin validar nada; null si no apunta a un upload. */
  private async peekReference(value: unknown): Promise<string | null> {
    if (typeof value !== 'string' || value === '') return null;
    if (BlobReferenceService.isReference(value)) return value;
    const blobName = blobNameFromSignedUrl(value, this.azure.containerUrls);
    if (!blobName) return null;
    const up = await this.findUpload({ blobName });
    return up ? `${BLOB_REF_PREFIX}${up.id}` : null;
  }

  /**
   * Valor recibido del cliente -> `upload:<id>` para guardar. Una URL firmada propia se convierte;
   * una URL externa o de un blob inexistente queda igual. Una referencia (o URL que se resuelve a un
   * upload) solo se acepta si (a) ya es el valor guardado en ese registro (`current`), (b) el upload es
   * publico o (c) se subio hace <= 15 min (en ese caso se marca publico: logos e imagenes de juego son
   * contenido publico). Si no, 400 «Archivo no válido»: nadie puede referenciar el archivo privado de otro.
   */
  async toReference<T extends string | null | undefined>(
    value: T,
    current?: string | null | (string | null | undefined)[],
  ): Promise<T | string> {
    if (typeof value !== 'string' || value === '') return value;
    let up: { id: string; isPublic: boolean; createdAt: Date } | null;
    if (BlobReferenceService.isReference(value)) {
      up = await this.findUpload({ id: value.slice(BLOB_REF_PREFIX.length) });
    } else {
      const blobName = blobNameFromSignedUrl(value, this.azure.containerUrls);
      if (!blobName) return value;
      up = await this.findUpload({ blobName });
      if (!up) return value;
    }
    if (!up) throw new BadRequestException('Archivo no válido');
    const ref = `${BLOB_REF_PREFIX}${up.id}`;

    const stored = Array.isArray(current) ? current : [current];
    for (const s of stored) {
      if (s === ref || (typeof s === 'string' && !BlobReferenceService.isReference(s) && (await this.peekReference(s)) === ref)) {
        return ref;
      }
    }
    if (up.isPublic) return ref;
    if (Date.now() - up.createdAt.getTime() <= FRESH_UPLOAD_WINDOW_MS) {
      await this.prisma.upload.update({ where: { id: up.id }, data: { isPublic: true } });
      return ref;
    }
    throw new BadRequestException('Archivo no válido');
  }

  /**
   * Convierte `logoUrl`, `gameFileUrl` y `additionalImages` de un DTO de escritura a referencias
   * (solo los presentes). `current` es lo que ya tiene guardado ese registro.
   */
  async referenceVideogameFields<T extends BlobFields>(dto: T, current?: BlobFields | null): Promise<T> {
    if (!dto) return dto;
    const out: BlobFields = { ...dto };
    if (typeof out.logoUrl === 'string') out.logoUrl = await this.toReference(out.logoUrl, current?.logoUrl);
    if (typeof out.gameFileUrl === 'string') out.gameFileUrl = await this.toReference(out.gameFileUrl, current?.gameFileUrl);
    if (Array.isArray(out.additionalImages)) {
      const stored = current?.additionalImages ?? [];
      out.additionalImages = await Promise.all(out.additionalImages.map((img) => this.toReference(img, stored)));
    }
    return out as T;
  }
}
