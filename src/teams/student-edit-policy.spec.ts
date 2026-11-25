import { ForbiddenException } from '@nestjs/common';
import { ROLE_IDS } from '../auth/constants/roles';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { VideogamesService } from '../videogames/videogames.service';
import { TeamsService } from './services/teams.service';
import {
  ASK_ADMIN,
  assertStudentTeamPatch,
  studentEditNeedsReview,
  TeamEditSnapshot,
} from './student-edit-policy';

/**
 * ARK-161 (BG-38): qué puede editar un estudiante de su equipo, según la tabla de SP-05
 * (ARK-166) aprobada por Allison. El backend rechaza con 403 aunque el cambio llegue por la API.
 */
const current: TeamEditSnapshot = {
  teamName: 'Los Pixeles',
  videogameName: 'Juego actual',
  logoUrl: 'upload:logo-1',
  allowMobile: false,
};

describe('assertStudentTeamPatch', () => {
  it.each([
    ['los integrantes', { members: [] }],
    ['si el equipo es externo', { isExternal: true }],
    ['el estado de aprobación', { videogame: { videogameStatusId: 1 } }],
    ['el nombre del juego', { videogame: { vgName: 'Otro juego' } }],
    // TA-36 (ARK-326)
    ['si el juego se puede jugar en celular', { videogame: { allowMobile: true } }],
  ])('responde 403 si el estudiante cambia %s', (what, dto) => {
    expect(() => assertStudentTeamPatch(dto as any, current)).toThrow(
      new ForbiddenException(
        `Solo el administrador puede cambiar ${what}. ${ASK_ADMIN}`,
      ),
    );
  });

  it('deja pasar el nombre del juego igual al actual (con espacios): el front siempre lo envía', () => {
    expect(() =>
      assertStudentTeamPatch(
        { videogame: { vgName: '  Juego actual ' } } as any,
        current,
      ),
    ).not.toThrow();
  });

  it('deja pasar el nombre del equipo y el contenido del juego', () => {
    const dto = {
      teamName: 'Nuevo nombre',
      videogame: {
        description: 'd',
        logoUrl: 'upload:logo-2',
        videoUrl: 'https://youtu.be/x',
        repoUrl: 'https://github.com/x/y',
        additionalImages: [],
        gameFileUrl: 'upload:zip',
        entry: 'index.html',
      },
    };
    expect(() => assertStudentTeamPatch(dto as any, current)).not.toThrow();
  });
});

describe('studentEditNeedsReview', () => {
  it.each([
    [
      'descripción y enlaces',
      false,
      { videogame: { description: 'x', repoUrl: 'https://g.co' } },
    ],
    ['el mismo logo', false, { videogame: { logoUrl: 'upload:logo-1' } }],
    ['el mismo nombre de equipo', false, { teamName: ' Los Pixeles ' }],
    ['otro logo', true, { videogame: { logoUrl: 'upload:logo-2' } }],
    ['quitar el logo', true, { videogame: { logoUrl: '' } }],
    ['otro nombre de equipo', true, { teamName: 'Los Bits' }],
  ])('%s → vuelve a PENDIENTE: %s', (_n, expected, dto) => {
    expect(studentEditNeedsReview(dto as any, current)).toBe(expected);
  });
});

describe('TeamsService con BG-38', () => {
  const repository = {
    findOne: jest.fn(),
    update: jest.fn(),
    updateTeamInfo: jest.fn(),
  };
  const prisma = {
    team: {
      findUnique: jest.fn((args: { select?: { edition?: unknown } }) =>
        Promise.resolve(
          args.select?.edition
            ? { edition: { status: 'ACTIVE', title: 'E5' } }
            : {
                teamName: current.teamName,
                videogame: {
                  name: current.videogameName,
                  logoUrl: current.logoUrl,
                },
              },
        ),
      ),
    },
    videogame: { findUnique: jest.fn().mockResolvedValue(null) },
    eventConfiguration: { findFirst: jest.fn() },
  };
  const service = new TeamsService(
    {} as any,
    repository as any,
    {} as any,
    prisma as any,
    {} as any,
    blobRefsPassthrough(),
    {} as any,
  );
  const leader = { id: 'leader-1', roleId: ROLE_IDS.STUDENT } as any;
  const admin = { id: 'admin-1', roleId: ROLE_IDS.ADMIN } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue({ id: 10, userId: 'leader-1' });
    repository.updateTeamInfo.mockResolvedValue(null);
    repository.update.mockResolvedValue({});
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      registrationsOpen: true,
    });
  });

  it('el líder no puede cambiar su NRC por PATCH /teams/:id con `members`', async () => {
    const dto = { members: [{ id: 1, nrc: ['3333'] }] };
    await expect(service.update(10, dto as any, leader)).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('el líder no puede marcar el equipo como externo', async () => {
    await expect(
      service.update(10, { isExternal: true } as any, leader),
    ).rejects.toThrow(
      /Solo el administrador puede cambiar si el equipo es externo/,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('con las inscripciones cerradas el líder recibe 403', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      registrationsOpen: false,
    });
    await expect(
      service.updateTeamInfo(
        10,
        { videogame: { description: 'x' } } as any,
        leader,
      ),
    ).rejects.toThrow(/Las inscripciones están cerradas/);
    expect(repository.updateTeamInfo).not.toHaveBeenCalled();
  });

  it('editar el contenido no devuelve el juego a PENDIENTE', async () => {
    await service.updateTeamInfo(
      10,
      { videogame: { description: 'x' } } as any,
      leader,
    );
    expect(repository.updateTeamInfo).toHaveBeenCalledWith(
      10,
      expect.anything(),
      false,
      undefined,
    );
  });

  it('cambiar el logo sí lo devuelve a PENDIENTE', async () => {
    await service.updateTeamInfo(
      10,
      { videogame: { logoUrl: 'upload:logo-2' } } as any,
      leader,
    );
    expect(repository.updateTeamInfo).toHaveBeenCalledWith(
      10,
      expect.anything(),
      true,
      undefined,
    );
  });

  it('el administrador cambia integrantes y externo, sin mirar las inscripciones ni volver a PENDIENTE', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      registrationsOpen: false,
    });
    await service.update(10, { isExternal: true, members: [] } as any, admin);
    expect(repository.update).toHaveBeenCalledWith(
      10,
      expect.anything(),
      false,
      'admin-1',
    );
    expect(prisma.eventConfiguration.findFirst).not.toHaveBeenCalled();
  });
});

describe('VideogamesService.update con BG-38', () => {
  const prisma = {
    videogame: { findUnique: jest.fn(), update: jest.fn() },
    eventConfiguration: { findFirst: jest.fn() },
  };
  const service = new VideogamesService(
    prisma as any,
    {} as any,
    blobRefsPassthrough(),
  );
  const game = {
    id: 7,
    name: 'Juego',
    team: { userId: 'leader-1', edition: { status: 'ACTIVE', title: 'E5' } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.videogame.findUnique.mockResolvedValue(game);
    prisma.videogame.update.mockResolvedValue({ id: 7 });
  });

  it('con las inscripciones cerradas el líder recibe 403', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      registrationsOpen: false,
    });
    await expect(
      service.update(
        7,
        { description: 'x' } as any,
        { id: 'leader-1', roleId: ROLE_IDS.STUDENT } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.videogame.update).not.toHaveBeenCalled();
  });

  it('el administrador edita aunque estén cerradas', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      registrationsOpen: false,
    });
    await service.update(
      7,
      { description: 'x' } as any,
      { id: 'a', roleId: ROLE_IDS.ADMIN } as any,
    );
    expect(prisma.videogame.update).toHaveBeenCalled();
  });
});
