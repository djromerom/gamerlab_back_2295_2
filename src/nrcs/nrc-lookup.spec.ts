import { findNrcIdsByCodes } from './nrc-lookup';

describe('findNrcIdsByCodes', () => {
  const db = { nRC: { findMany: jest.fn() } };

  beforeEach(() => jest.clearAllMocks());

  it('filtra por edición y por NRC activo', async () => {
    db.nRC.findMany.mockResolvedValue([{ id: 7, code: 9999 }]);

    const result = await findNrcIdsByCodes(db as any, [9999], 4);

    expect(db.nRC.findMany).toHaveBeenCalledWith({
      where: { code: { in: [9999] }, editionId: 4, isActive: true },
      select: { id: true, code: true },
    });
    expect(result).toEqual({ ids: [7], missing: [] });
  });

  it('missing se calcula por conjunto de códigos, no por length', async () => {
    // Dos filas con el mismo código (length 2 == codes.length 2) pero falta 1111
    db.nRC.findMany.mockResolvedValue([
      { id: 1, code: 9999 },
      { id: 2, code: 9999 },
    ]);

    const result = await findNrcIdsByCodes(db as any, [9999, 1111], 4);

    expect(result.missing).toEqual([1111]);
    expect(result.ids).toEqual([1, 2]);
  });
});
