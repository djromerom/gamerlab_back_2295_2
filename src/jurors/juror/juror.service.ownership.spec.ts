import { ForbiddenException } from '@nestjs/common';
import { JurorService } from './juror.service';
import { ROLE_IDS } from 'src/auth/constants/roles';

/**
 * BG-01 — Las estadísticas de evaluación de un equipo: un estudiante solo ve las
 * de SU equipo; administrador, profesor y jurado pueden ver las de cualquiera.
 */
describe('JurorService.assertCanViewTeamEvaluationStats (BG-01)', () => {
  const prisma = { team: { findUnique: jest.fn() }, member: { findFirst: jest.fn() } };
  const service = new JurorService({} as any, prisma as any, {} as any);

  const student = { id: 'leader-1', roleId: ROLE_IDS.STUDENT } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.team.findUnique.mockResolvedValue({ userId: 'leader-1' });
    prisma.member.findFirst.mockResolvedValue(null);
  });

  it('permite a un estudiante ver las estadísticas de su propio equipo', async () => {
    await expect(
      service.assertCanViewTeamEvaluationStats(student, 10),
    ).resolves.toBeUndefined();
  });

  it('rechaza a un estudiante que consulta el equipo de otro', async () => {
    prisma.team.findUnique.mockResolvedValue({ userId: 'otro-lider' });

    await expect(
      service.assertCanViewTeamEvaluationStats(student, 10),
    ).rejects.toThrow(ForbiddenException);
  });

  it('permite a un integrante activo (no líder) ver las estadísticas de su equipo', async () => {
    prisma.team.findUnique.mockResolvedValue({ userId: 'otro-lider' });
    prisma.member.findFirst.mockResolvedValue({ id: 7 });
    const member = { id: 'integrante-1', email: 'Integrante@Uninorte.edu.co', roleId: ROLE_IDS.STUDENT } as any;

    await expect(
      service.assertCanViewTeamEvaluationStats(member, 10),
    ).resolves.toBeUndefined();
    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: {
        isActive: true,
        email: { equals: 'integrante@uninorte.edu.co', mode: 'insensitive' },
        teamId: 10,
      },
      select: { id: true },
    });
  });

  it('rechaza a un estudiante que no es líder ni integrante activo del equipo', async () => {
    prisma.team.findUnique.mockResolvedValue({ userId: 'otro-lider' });
    const other = { id: 'x-1', email: 'otro@uninorte.edu.co', roleId: ROLE_IDS.STUDENT } as any;

    await expect(
      service.assertCanViewTeamEvaluationStats(other, 10),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechaza a un estudiante si el equipo no existe (no revela su existencia)', async () => {
    prisma.team.findUnique.mockResolvedValue(null);

    await expect(
      service.assertCanViewTeamEvaluationStats(student, 999),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    ['administrador', ROLE_IDS.ADMIN],
    ['profesor', ROLE_IDS.PROFESSOR],
    ['jurado', ROLE_IDS.JUROR],
  ])(
    'permite a un %s consultar cualquier equipo sin consultar la base',
    async (_name, roleId) => {
      await expect(
        service.assertCanViewTeamEvaluationStats(
          { id: 'x', roleId } as any,
          10,
        ),
      ).resolves.toBeUndefined();
      expect(prisma.team.findUnique).not.toHaveBeenCalled();
    },
  );
});
