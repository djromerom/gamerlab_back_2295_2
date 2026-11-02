import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { ROLE_IDS } from '../../auth/constants/roles';
import { blobRefsPassthrough } from '../../upload/blob-reference.mock';

/**
 * ARK-112 — `GET /teams/:id` y `GET /teams/:id/full` las puede pedir cualquier estudiante
 * (el rol Estudiante tiene `GetTeam`). Un estudiante solo lee su propio equipo, y los
 * correos, códigos estudiantiles y el código de verificación solo llegan a quien puede verlos.
 */
describe('TeamsService — lectura de un equipo por rol (ARK-112)', () => {
  const repository = {
    findOne: jest.fn(),
    isActiveMember: jest.fn(),
    findOneWithDetails: jest.fn(),
    findOneWithDetailsByLeaderId: jest.fn(),
  };
  const service = new TeamsService(
    {} as any,
    repository as any,
    {} as any,
    {} as any,
    {} as any, // settingsService (ranking-y-datos-privados)
    blobRefsPassthrough(), // blobRefs (blob-referencia-back)
  );

  const user = (roleId: number, id: string, email: string) =>
    ({ id, email, roleId }) as any;
  const leader = user(ROLE_IDS.STUDENT, 'leader-1', 'lider@uni.edu');
  const member = user(ROLE_IDS.STUDENT, 'm-1', 'integrante@UNI.edu');
  const otherStudent = user(ROLE_IDS.STUDENT, 'x', 'x@uni.edu');
  const admin = user(ROLE_IDS.ADMIN, 'a', 'a@uni.edu');
  const professor = user(ROLE_IDS.PROFESSOR, 'p', 'p@uni.edu');
  const juror = user(ROLE_IDS.JUROR, 'j', 'j@uni.edu');

  const row = {
    id: 10,
    teamName: 'Los Pixel',
    userId: 'leader-1',
    teamCode: 'N1-IST-4',
    verificationCode: 'AB12CD34',
  };

  const details = {
    ...row,
    user: { id: 'leader-1', email: 'lider@uni.edu', firstName: 'Ana' },
    members: [
      {
        id: 1,
        firstName: 'Iván',
        email: 'Integrante@uni.edu',
        studentCode: '200',
      },
      { id: 2, firstName: 'Sara', email: 'otro@uni.edu', studentCode: '201' },
    ],
    assignedJurors: [{ id: 'j', firstName: 'Juan', email: 'jurado@uni.edu' }],
    videogame: { id: 5, name: 'Juego', logoUrl: null },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findOne.mockResolvedValue(row);
    repository.isActiveMember.mockImplementation(
      async (_teamId: number, email: string) =>
        email.toLowerCase() === 'integrante@uni.edu',
    );
    repository.findOneWithDetailsByLeaderId.mockResolvedValue(null);
    repository.findOneWithDetails.mockResolvedValue(details);
  });

  describe('GET /teams/:id', () => {
    it('rechaza a un estudiante de otro equipo', async () => {
      await expect(service.findOne(10, otherStudent)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('permite al líder sin consultar los integrantes', async () => {
      await expect(service.findOne(10, leader)).resolves.toEqual(row);
      expect(repository.isActiveMember).not.toHaveBeenCalled();
    });

    it('permite a un integrante activo', async () => {
      await expect(service.findOne(10, member)).resolves.toEqual(row);
      expect(repository.isActiveMember).toHaveBeenCalledWith(
        10,
        'integrante@UNI.edu',
      );
    });

    it('el administrador recibe el equipo completo', async () => {
      await expect(service.findOne(10, admin)).resolves.toEqual(row);
    });

    it.each([
      ['profesor', professor],
      ['jurado', juror],
    ])('el %s lo recibe sin el código de verificación', async (_rol, u) => {
      const team = (await service.findOne(10, u)) as Record<string, unknown>;
      expect(team).not.toHaveProperty('verificationCode');
      expect(team).toMatchObject({ id: 10, teamCode: 'N1-IST-4' });
    });

    it('responde 404 antes de comprobar la pertenencia', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findOne(99, otherStudent)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('GET /teams/:id/full', () => {
    it('rechaza a un estudiante de otro equipo', async () => {
      await expect(
        service.findOneWithDetails('10', otherStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza a un estudiante que busca por el id del líder de otro equipo', async () => {
      repository.findOneWithDetailsByLeaderId.mockResolvedValue(details);
      await expect(
        service.findOneWithDetails('leader-1', otherStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it.each([
      ['líder', leader],
      ['integrante (correo sin distinguir mayúsculas)', member],
    ])(
      'el %s ve integrantes con correo y código, pero no el correo de los jurados',
      async (_rol, u) => {
        const team = (await service.findOneWithDetails('10', u)) as any;
        expect(team.members).toEqual(details.members);
        expect(team.verificationCode).toBe('AB12CD34');
        expect(team.assignedJurors).toEqual([{ id: 'j', firstName: 'Juan' }]);
      },
    );

    it('el administrador ve todo, incluido el correo de los jurados', async () => {
      await expect(service.findOneWithDetails('10', admin)).resolves.toEqual(
        details,
      );
    });

    it.each([
      ['profesor', professor],
      ['jurado', juror],
    ])(
      'el %s lo recibe sin correos, códigos ni código de verificación',
      async (_rol, u) => {
        const team = (await service.findOneWithDetails('10', u)) as any;
        expect(JSON.stringify(team)).not.toMatch(
          /@uni\.edu|studentCode|AB12CD34/,
        );
        expect(team.members.map((m: any) => m.firstName)).toEqual([
          'Iván',
          'Sara',
        ]);
        expect(team.videogame).toEqual(details.videogame);
      },
    );

    it('no modifica el objeto que devuelve el repositorio', async () => {
      await service.findOneWithDetails('10', professor);
      expect(details.members[0].email).toBe('Integrante@uni.edu');
      expect(details.verificationCode).toBe('AB12CD34');
    });
  });
});
