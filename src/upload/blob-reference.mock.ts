import { BlobReferenceService } from './blob-reference.service';

const identity = async (v: unknown) => v;

/**
 * Mock de BlobReferenceService que deja pasar todo sin cambios (para specs que no prueban referencias).
 * Son funciones planas (no jest.fn) para sobrevivir a jest.resetAllMocks().
 */
export const blobRefsPassthrough = () =>
  ({
    resolve: identity,
    resolveVideogame: identity,
    resolveInPlace: identity,
    resolveTeamsVideogames: identity,
    resolveKeys: identity,
    referenceVideogameFields: identity,
    toReference: identity,
  }) as unknown as BlobReferenceService;

export const blobRefsProvider = { provide: BlobReferenceService, useValue: blobRefsPassthrough() };
