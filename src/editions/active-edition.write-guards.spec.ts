import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TeamsService } from '../teams/services/teams.service';
import { VideogamesService } from '../videogames/videogames.service';
import {
  SettingsService,
  WEIGHTS_NOT_CONFIGURED,
} from '../settings/settings.service';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { ROLE_IDS } from '../auth/constants/roles';
import { EDITION_READ_ONLY, NO_ACTIVE_EDITION } from './active-edition';

/**
 * ARK-130 (HU-27): las escrituras rechazan datos de una edición que no es la activa, y lo exige
 * el servidor. Si alguien quita una de estas validaciones, esta prueba falla.
 * (Asignaciones, NRC, NRC del integrante y código de verificación tienen su caso en su propio spec.)
 */
const PAST = { status: 'INACTIVE', title: 'Feria 4' };
const admin = { id: 'admin-1', roleId: ROLE_IDS.ADMIN } as any;

const expectReadOnly = async (call: Promise<unknown>) => {
  const error = await call.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BadRequestException);
  expect(
    ((error as BadRequestException).getResponse() as { code: string }).code,
  ).toBe(EDITION_READ_ONLY);
};

describe('Escrituras sobre una edición anterior (HU-27)', () => {
  describe('TeamsService', () => {
    const repository = {
      findOne: jest.fn(),
      update: jest.fn(),
      updateTeamInfo: jest.fn(),
      remove: jest.fn(),
      addMember: jest.fn(),
      deleteMember: jest.fn(),
      findMemberById: jest.fn(),
    };
    const prisma = { team: { findUnique: jest.fn() } };
    const service = new TeamsService(
      {} as any,
      repository as any,
      {} as any,
      prisma as any,
      {} as any,
      blobRefsPassthrough(),
      {} as any,
    );

    beforeEach(() => {
      jest.resetAllMocks();
      repository.findOne.mockResolvedValue({ id: 4, userId: 'leader-4' });
      prisma.team.findUnique.mockResolvedValue({ edition: PAST });
    });

    it.each([
      ['PATCH /teams/:id', () => service.update(4, {} as any, admin)],
      [
        'PATCH /teams/:id/info',
        () => service.updateTeamInfo(4, {} as any, admin),
      ],
      ['DELETE /teams/:id', () => service.remove(4)],
      ['POST /teams/:id/member', () => service.addMember(4, {} as any, admin)],
      [
        'DELETE /teams/:id/members/:memberId',
        () => service.deleteMember(4, 1, admin),
      ],
      [
        'PATCH /teams/:teamId/members/:memberId',
        () =>
          service.updateMemberEmail(
            4,
            1,
            { email: 'a@b.co' } as any,
            'leader-4',
          ),
      ],
    ])(
      '%s responde 400 EDITION_READ_ONLY y no escribe',
      async (_route, call) => {
        await expectReadOnly(call());
        expect(repository.update).not.toHaveBeenCalled();
        expect(repository.updateTeamInfo).not.toHaveBeenCalled();
        expect(repository.remove).not.toHaveBeenCalled();
        expect(repository.addMember).not.toHaveBeenCalled();
        expect(repository.deleteMember).not.toHaveBeenCalled();
      },
    );

    it('en la edición activa sí escribe', async () => {
      prisma.team.findUnique.mockResolvedValue({
        edition: { status: 'ACTIVE', title: 'Feria 5' },
      });
      repository.addMember.mockResolvedValue({ id: 1 });
      await expect(service.addMember(4, {} as any, admin)).resolves.toEqual({
        id: 1,
      });
    });
  });

  describe('VideogamesService', () => {
    const prisma = {
      videogame: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const service = new VideogamesService(
      prisma as any,
      {} as any,
      blobRefsPassthrough(),
    );

    beforeEach(() => {
      jest.resetAllMocks();
      prisma.videogame.findUnique.mockResolvedValue({
        id: 9,
        name: 'Juego',
        team: { userId: 'leader-4', edition: PAST },
      });
    });

    it('PATCH /videogames/:id (incluido el cambio de estado) responde 400', async () => {
      await expectReadOnly(
        service.update(9, { videogameStatusId: 1 } as any, admin),
      );
      expect(prisma.videogame.update).not.toHaveBeenCalled();
    });

    it('DELETE /videogames/:id responde 400', async () => {
      await expectReadOnly(service.remove(9));
      expect(prisma.videogame.delete).not.toHaveBeenCalled();
    });
  });

  describe('SettingsService (ponderados)', () => {
    const prisma = {
      edition: { findFirst: jest.fn(), findUnique: jest.fn() },
      weighting: { upsert: jest.fn(), findUnique: jest.fn() },
    };
    const service = new SettingsService(prisma as any);

    beforeEach(() => jest.resetAllMocks());

    it('no cambia los ponderados de una edición anterior', async () => {
      prisma.edition.findUnique.mockResolvedValue({ id: 4, ...PAST });
      await expectReadOnly(
        service.upsertWeights({
          seniorPct: 60,
          juniorPct: 40,
          editionId: 4,
        } as any),
      );
      expect(prisma.weighting.upsert).not.toHaveBeenCalled();
    });

    it('sin editionId usa la edición activa, no «la de id más alto»', async () => {
      prisma.edition.findFirst.mockResolvedValue({
        id: 3,
        status: 'ACTIVE',
        title: 'Feria 3',
      });
      await service.upsertWeights({ seniorPct: 60, juniorPct: 40 } as any);
      expect(prisma.edition.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ACTIVE' } }),
      );
      expect(prisma.weighting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { editionId: 3 } }),
      );
    });

    // Revisión de DevOps: antes salía 200 con cuerpo vacío y GradeWeightsPage fallaba en res.json()
    const notFoundCode = async (call: Promise<unknown>) => {
      const error = await call.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(NotFoundException);
      return ((error as NotFoundException).getResponse() as { code: string })
        .code;
    };

    it('GET /settings/weights sin edición activa: 404 NO_ACTIVE_EDITION', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      expect(await notFoundCode(service.getLatest())).toBe(NO_ACTIVE_EDITION);
      expect(prisma.weighting.findUnique).not.toHaveBeenCalled();
    });

    it('la edición activa sin ponderados: 404 WEIGHTS_NOT_CONFIGURED', async () => {
      prisma.edition.findFirst.mockResolvedValue({
        id: 3,
        status: 'ACTIVE',
        title: 'Feria 3',
      });
      prisma.weighting.findUnique.mockResolvedValue(null);
      expect(await notFoundCode(service.getLatest())).toBe(
        WEIGHTS_NOT_CONFIGURED,
      );
    });

    it('con ponderados devuelve los de la edición activa', async () => {
      prisma.edition.findFirst.mockResolvedValue({
        id: 3,
        status: 'ACTIVE',
        title: 'Feria 3',
      });
      prisma.weighting.findUnique.mockResolvedValue({
        editionId: 3,
        seniorPct: 60,
        juniorPct: 40,
      });
      await expect(service.getLatest()).resolves.toMatchObject({
        editionId: 3,
        seniorPct: 60,
      });
      expect(prisma.weighting.findUnique).toHaveBeenCalledWith({
        where: { editionId: 3 },
      });
    });
  });
});
