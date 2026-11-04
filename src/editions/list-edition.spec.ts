import { NotFoundException } from '@nestjs/common';
import { parseEditionIdParam, resolveListEdition } from './list-edition';

/** ARK-129 (HU-26): edición de los listados de equipos y estudiantes. */
describe('resolveListEdition', () => {
  const prisma = { edition: { findFirst: jest.fn(), findUnique: jest.fn() } };

  beforeEach(() => jest.resetAllMocks());

  it('sin editionId usa la edición activa y no es de solo lectura', async () => {
    prisma.edition.findFirst.mockResolvedValue({ id: 5, title: 'E5', status: 'ACTIVE' });
    await expect(resolveListEdition(prisma as any)).resolves.toEqual({
      id: 5,
      title: 'E5',
      status: 'ACTIVE',
      readOnly: false,
    });
    expect(prisma.edition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' }, orderBy: { id: 'desc' } }),
    );
  });

  it('sin edición activa devuelve null (lista vacía, sin mezclar ediciones)', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);
    await expect(resolveListEdition(prisma as any)).resolves.toBeNull();
  });

  it('una edición anterior se devuelve en solo lectura', async () => {
    prisma.edition.findUnique.mockResolvedValue({ id: 4, title: 'E4', status: 'INACTIVE', endsAt: new Date() });
    await expect(resolveListEdition(prisma as any, 4)).resolves.toEqual({
      id: 4,
      title: 'E4',
      status: 'INACTIVE',
      readOnly: true,
    });
  });

  it('una edición que no existe responde 404', async () => {
    prisma.edition.findUnique.mockResolvedValue(null);
    await expect(resolveListEdition(prisma as any, 99)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('parseEditionIdParam', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['4', 4],
    ['abc', 'invalid'],
    ['0', 'invalid'],
    ['-1', 'invalid'],
    ['2.5', 'invalid'],
    ['99999999999999999999', 'invalid'],
  ])('%p → %p', (raw, expected) => {
    expect(parseEditionIdParam(raw)).toBe(expected);
  });
});
