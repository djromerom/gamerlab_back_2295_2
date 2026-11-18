import { BadRequestException } from '@nestjs/common';
import { TeamVerificationService } from './team-verification.service';
import { TEAM_NOT_GRADABLE } from '../teams/team-gradable';

/**
 * ARK-257 (BG-57): un equipo no calificable es un presentador externo; nadie le dice el código a
 * un jurado, así que el back no lo entrega al estudiante ni al administrador.
 */
describe('TeamVerificationService con un equipo no calificable (ARK-257)', () => {
  const team = (notGradable: boolean) => ({
    id: 10,
    editionId: 1,
    teamCode: 'N1-ABC-101',
    verificationCode: 'K7M2QX',
    notGradable,
    edition: { status: 'ACTIVE', title: 'Edición 1' },
  });

  const setup = (notGradable: boolean) => {
    const prisma = {
      team: {
        findFirst: jest.fn().mockResolvedValue(team(notGradable)),
        update: jest.fn(),
      },
      teamVerificationLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    return { prisma, service: new TeamVerificationService(prisma as never) };
  };

  describe('panel del estudiante (my-code)', () => {
    it('un equipo calificable recibe su código', async () => {
      const { service } = setup(false);
      await expect(service.getCodeForStudent('u1')).resolves.toEqual({
        teamId: 10,
        teamCode: 'N1-ABC-101',
        verificationCode: 'K7M2QX',
        notGradable: false,
      });
    });

    it('un equipo no calificable no recibe el código y se avisa con notGradable', async () => {
      const { service } = setup(true);
      await expect(service.getCodeForStudent('u1')).resolves.toEqual({
        teamId: 10,
        teamCode: 'N1-ABC-101',
        verificationCode: null,
        notGradable: true,
      });
    });
  });

  describe('administrador', () => {
    it.each([
      ['consultar', (s: TeamVerificationService) => s.getCodeForAdmin(10, 'a')],
      ['regenerar', (s: TeamVerificationService) => s.regenerate(10, 'a')],
    ])(
      'no se puede %s el código de un equipo no calificable (400)',
      async (_name, call) => {
        const { service, prisma } = setup(true);
        const error: unknown = await call(service).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: TEAM_NOT_GRADABLE,
          message: expect.stringContaining('presentador externo') as string,
        });
        // No deja bitácora ni cambia nada
        expect(prisma.teamVerificationLog.create).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.team.update).not.toHaveBeenCalled();
      },
    );

    it('un equipo calificable sigue mostrando su código al administrador', async () => {
      const { service, prisma } = setup(false);
      await expect(service.getCodeForAdmin(10, 'a')).resolves.toEqual({
        teamId: 10,
        code: 'K7M2QX',
      });
      expect(prisma.teamVerificationLog.create).toHaveBeenCalledTimes(1);
    });
  });
});
