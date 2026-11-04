import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  EDITION_READ_ONLY,
  assertEditionWritable,
  assertNrcWritable,
  assertTeamWritable,
  assertVideogameWritable,
  findActiveEdition,
  requireActiveEdition,
} from './active-edition';

/** ARK-130 (HU-27): fuente única de la edición activa y regla de escritura. */
describe('active-edition', () => {
  const active = { status: 'ACTIVE' as const, title: 'Feria 5' };
  const past = { status: 'INACTIVE' as const, title: 'Feria 4' };

  describe('findActiveEdition / requireActiveEdition', () => {
    const prisma = { edition: { findFirst: jest.fn() } };
    beforeEach(() => jest.resetAllMocks());

    it('busca la ACTIVE (la más reciente si hubiera dos), nunca «la de id más alto» sin filtro', async () => {
      prisma.edition.findFirst.mockResolvedValue({ id: 5 });
      await findActiveEdition(prisma as any);
      expect(prisma.edition.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE' },
          orderBy: { id: 'desc' },
        }),
      );
    });

    it('requireActiveEdition responde 404 con un mensaje claro si no hay edición activa', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      await expect(requireActiveEdition(prisma as any)).rejects.toThrow(
        NotFoundException,
      );
      await expect(requireActiveEdition(prisma as any)).rejects.toThrow(
        /No hay una edición activa/,
      );
    });
  });

  describe('assertEditionWritable', () => {
    it('deja pasar la edición activa', () => {
      expect(() => assertEditionWritable(active, 'el equipo')).not.toThrow();
    });

    it.each(['INACTIVE', 'ARCHIVED'] as const)(
      'rechaza una edición %s con 400 EDITION_READ_ONLY',
      (status) => {
        try {
          assertEditionWritable({ status, title: 'Feria 4' }, 'el NRC');
          throw new Error('no lanzó');
        } catch (error) {
          expect(error).toBeInstanceOf(BadRequestException);
          const body = (error as BadRequestException).getResponse() as {
            code: string;
            message: string;
          };
          expect(body.code).toBe(EDITION_READ_ONLY);
          expect(body.message).toContain('el NRC');
          expect(body.message).toContain('«Feria 4»');
          expect(body.message).toContain('solo lectura');
        }
      },
    );

    it('concuerda en plural («los jurados del equipo»)', () => {
      expect(() =>
        assertEditionWritable(past, 'los jurados del equipo'),
      ).toThrow(
        /^No se pueden modificar los jurados del equipo: pertenecen a «Feria 4»/,
      );
    });
  });

  describe('assertTeamWritable / assertNrcWritable / assertVideogameWritable', () => {
    const prisma = {
      team: { findUnique: jest.fn() },
      nRC: { findUnique: jest.fn() },
      videogame: { findUnique: jest.fn() },
    };
    beforeEach(() => jest.resetAllMocks());

    it('equipo de la edición activa: pasa; de una anterior: 400; inexistente: 404', async () => {
      prisma.team.findUnique.mockResolvedValueOnce({ edition: active });
      await expect(
        assertTeamWritable(prisma as any, 1),
      ).resolves.toBeUndefined();
      prisma.team.findUnique.mockResolvedValueOnce({ edition: past });
      await expect(assertTeamWritable(prisma as any, 2)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      prisma.team.findUnique.mockResolvedValueOnce(null);
      await expect(assertTeamWritable(prisma as any, 3)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('NRC de una edición anterior: 400', async () => {
      prisma.nRC.findUnique.mockResolvedValue({ edition: past });
      await expect(assertNrcWritable(prisma as any, 9)).rejects.toThrow(
        /el NRC/,
      );
    });

    it('videojuego: mira la edición de su equipo', async () => {
      prisma.videogame.findUnique.mockResolvedValue({
        team: { edition: past },
      });
      await expect(assertVideogameWritable(prisma as any, 7)).rejects.toThrow(
        /el videojuego/,
      );
      expect(prisma.videogame.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7 } }),
      );
    });
  });
});
