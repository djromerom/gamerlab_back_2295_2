import { BadRequestException } from '@nestjs/common';
import { resolveMemberNrcs } from './nrc-lookup';

/**
 * HU-31 (ARK-167): un NRC por materia, de la edición del equipo, y una o varias materias.
 * La base filtra por edición y activos; el mock devuelve lo que ella devolvería.
 */
const poo = (id: number, code: number) => ({
  id,
  code,
  subjectId: 1,
  subject: { name: 'Programación Orientada a Objetos' },
});
const datos = (id: number, code: number) => ({
  id,
  code,
  subjectId: 2,
  subject: { name: 'Estructura de Datos I' },
});

describe('resolveMemberNrcs', () => {
  const db = { nRC: { findMany: jest.fn() } };
  beforeEach(() => jest.clearAllMocks());

  const rejectsWith = (codes: Array<number | string>, message: string) =>
    expect(resolveMemberNrcs(db as any, codes, 4)).rejects.toMatchObject({
      response: { statusCode: 400, field: 'nrc', message },
    });

  it('una materia: busca solo NRC activos de la edición y devuelve sus ids', async () => {
    db.nRC.findMany.mockResolvedValue([poo(7, 2501)]);

    await expect(resolveMemberNrcs(db as any, ['2501'], 4)).resolves.toEqual([
      7,
    ]);
    expect(db.nRC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: { in: [2501] }, editionId: 4, isActive: true },
      }),
    );
  });

  it('dos materias (tercer semestre): un NRC de cada una', async () => {
    db.nRC.findMany.mockResolvedValue([poo(7, 2501), datos(8, 3101)]);

    await expect(
      resolveMemberNrcs(db as any, [2501, 3101], 4),
    ).resolves.toEqual([7, 8]);
  });

  it('tres materias también se aceptan', async () => {
    db.nRC.findMany.mockResolvedValue([
      poo(7, 2501),
      datos(8, 3101),
      { id: 9, code: 4101, subjectId: 3, subject: { name: 'Bases de Datos' } },
    ]);

    await expect(
      resolveMemberNrcs(db as any, [2501, 3101, 4101], 4),
    ).resolves.toHaveLength(3);
  });

  it('dos NRC de la misma materia responde 400', async () => {
    db.nRC.findMany.mockResolvedValue([poo(7, 2501), poo(9, 2502)]);

    await rejectsWith(
      [2501, 2502],
      'Elige un solo NRC por materia: Programación Orientada a Objetos tiene 2501 y 2502',
    );
  });

  it('un NRC de otra edición (la base no lo devuelve) responde 400 aunque el otro exista', async () => {
    db.nRC.findMany.mockResolvedValue([poo(7, 2501)]);

    await rejectsWith(
      [2501, 9999],
      'Estos NRC no existen en la edición activa: 9999',
    );
  });

  it('un código que no es un número responde 400 sin consultarlo', async () => {
    db.nRC.findMany.mockResolvedValue([poo(7, 2501)]);

    await rejectsWith(
      ['2501', 'abc'],
      'Estos NRC no existen en la edición activa: abc',
    );
    expect(db.nRC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: { in: [2501] }, editionId: 4, isActive: true },
      }),
    );
  });

  it('el mismo NRC repetido cuenta una sola vez', async () => {
    db.nRC.findMany.mockResolvedValue([poo(7, 2501)]);

    await expect(
      resolveMemberNrcs(db as any, ['2501', 2501], 4),
    ).resolves.toEqual([7]);
  });

  it('sin NRC responde 400', async () => {
    await expect(resolveMemberNrcs(db as any, [], 4)).rejects.toThrow(
      BadRequestException,
    );
    expect(db.nRC.findMany).not.toHaveBeenCalled();
  });
});
