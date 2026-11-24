import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinalGradeService } from './final-grade.service';

/** HU-20 (ARK-80): liberación de la nota final con la base simulada. */
describe('FinalGradeService', () => {
  const FAIR_START = new Date('2026-11-26T13:00:00Z'); // 8:00 en Colombia
  const BEFORE_NOON = new Date('2026-11-26T16:59:00Z'); // 11:59
  const AT_NOON = new Date('2026-11-26T17:00:00Z'); // 12:00

  const config = (over: Record<string, unknown> = {}) => ({
    id: 7,
    showFinalGrade: false,
    finalGradeReleasedAt: null,
    ...over,
  });

  const prisma = {
    edition: { findFirst: jest.fn() },
    eventConfiguration: { update: jest.fn() },
    teamFinalScore: { findMany: jest.fn(), findFirst: jest.fn() },
    team: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const service = new FinalGradeService(prisma as any);

  const activeEdition = (
    cfg: Record<string, unknown> | null = config(),
    fairSchedule: { fairDate: Date; closeTime: string } | null = null,
  ) =>
    prisma.edition.findFirst.mockResolvedValue({
      id: 5,
      title: 'Feria 2026-2',
      startsAt: FAIR_START,
      fairSchedule,
      eventConfiguration: cfg,
    });

  const row = (teamId: number, over: Record<string, unknown> = {}) => ({
    teamId,
    teamCode: `N1-AAA-${teamId}`,
    teamName: `Equipo ${teamId}`,
    isExternal: false,
    videogameName: `Juego ${teamId}`,
    finalScore: 4,
    juniorEvaluations: 3,
    seniorEvaluations: 1,
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.teamFinalScore.findMany.mockResolvedValue([]);
    prisma.team.findMany.mockResolvedValue([]);
  });

  describe('getReleaseStatus', () => {
    it('resume los equipos activos y lista los incompletos (primero los «en proceso»)', async () => {
      activeEdition();
      prisma.teamFinalScore.findMany.mockResolvedValue([
        row(1),
        row(2, { juniorEvaluations: 1 }), // 1 junior + 1 senior: menos de 3 (BG-68)
        row(3, { seniorEvaluations: 0 }),
        row(4, { seniorEvaluations: 0 }), // equipo dado de baja: no cuenta
      ]);
      prisma.team.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const status = await service.getReleaseStatus(BEFORE_NOON);

      expect(prisma.teamFinalScore.findMany).toHaveBeenCalledWith({
        where: { editionId: 5 },
      });
      expect(status).toMatchObject({
        editionId: 5,
        showFinalGrade: false,
        fairDate: '2026-11-26',
        releaseTime: '12:00',
        timeZone: 'America/Bogota',
        scheduleConfigured: false,
        releaseAllowedFrom: '2026-11-26T17:00:00.000Z',
        canReleaseNow: false,
        summary: {
          totalTeams: 3,
          withFinalGrade: 2,
          inProcess: 1,
          lessThanMinEvaluations: 1,
        },
      });
      expect(
        status.incompleteTeams.map((t) => [t.teamId, t.inProcess, t.reasons]),
      ).toEqual([
        [3, true, ['MISSING_PROFESSOR_SCORE']],
        [2, false, ['LESS_THAN_MIN_EVALUATIONS']],
      ]);
    });

    it('sin edición activa: 404 NO_ACTIVE_EDITION', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      await expect(service.getReleaseStatus()).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sin configuración del evento: 404', async () => {
      activeEdition(null);
      await expect(service.getReleaseStatus()).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'EVENT_CONFIGURATION_NOT_FOUND',
        }),
      });
    });
  });

  describe('setRelease', () => {
    it('antes de las 12:00 no deja liberar e indica la hora', async () => {
      activeEdition();
      const error: unknown = await service
        .setRelease(true, BEFORE_NOON)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'FINAL_GRADE_RELEASE_TOO_EARLY',
        releaseAllowedFrom: '2026-11-26T17:00:00.000Z',
        message: expect.stringContaining('12:00 del 26/11/2026'),
      });
      expect(prisma.eventConfiguration.update).not.toHaveBeenCalled();
    });

    it('con cronograma (HU-12) usa su hora de cierre: a las 12:10 todavía no si cierra a las 12:30', async () => {
      activeEdition(config(), {
        fairDate: new Date('2026-11-26T00:00:00Z'),
        closeTime: '12:30',
      });
      const error: unknown = await service
        .setRelease(true, new Date('2026-11-26T17:10:00Z'))
        .catch((e: unknown) => e);

      expect((error as BadRequestException).getResponse()).toMatchObject({
        releaseAllowedFrom: '2026-11-26T17:30:00.000Z',
        message: expect.stringContaining('12:30 del 26/11/2026'),
      });
      expect(prisma.eventConfiguration.update).not.toHaveBeenCalled();
    });

    it('desde las 12:00 libera y guarda cuándo', async () => {
      activeEdition();
      await service.setRelease(true, AT_NOON);
      expect(prisma.eventConfiguration.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { showFinalGrade: true, finalGradeReleasedAt: AT_NOON },
      });
    });

    it('ocultar se puede siempre, incluso antes de las 12:00, y oculta el ranking (BG-67)', async () => {
      activeEdition(
        config({ showFinalGrade: true, finalGradeReleasedAt: AT_NOON }),
      );
      await service.setRelease(false, BEFORE_NOON);
      expect(prisma.eventConfiguration.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { showFinalGrade: false, finalGradeReleasedAt: null, showRanking: false },
      });
    });

    it('liberar dos veces no cambia la hora de la primera liberación', async () => {
      activeEdition(
        config({ showFinalGrade: true, finalGradeReleasedAt: AT_NOON }),
      );
      await service.setRelease(true, new Date('2026-11-26T18:00:00Z'));
      expect(prisma.eventConfiguration.update).not.toHaveBeenCalled();
    });
  });

  describe('getStudentFinalGrade', () => {
    const team = (showFinalGrade: boolean | null) => ({
      id: 3,
      teamName: 'Pixel',
      teamCode: 'N2-ISI-014',
      editionId: 5,
      edition: {
        eventConfiguration: showFinalGrade === null ? null : { showFinalGrade },
      },
    });

    it('busca el equipo del estudiante en la edición activa', async () => {
      prisma.team.findFirst.mockResolvedValue(null);
      await expect(service.getStudentFinalGrade('u-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.team.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u-1', edition: { status: 'ACTIVE' } },
        }),
      );
    });

    it('con correo también busca el equipo en el que es integrante activo', async () => {
      prisma.team.findFirst.mockResolvedValue(team(false));
      await service.getStudentFinalGrade('integrante-1', 'Matias@Uninorte.edu.co');
      expect(prisma.team.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            edition: { status: 'ACTIVE' },
            OR: [
              { userId: 'integrante-1' },
              {
                members: {
                  some: {
                    isActive: true,
                    email: { equals: 'matias@uninorte.edu.co', mode: 'insensitive' },
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it('no liberada: ninguna nota y no consulta la vista', async () => {
      prisma.team.findFirst.mockResolvedValue(team(false));
      await expect(service.getStudentFinalGrade('u-1')).resolves.toEqual({
        editionId: 5,
        team: { id: 3, teamName: 'Pixel', teamCode: 'N2-ISI-014' },
        released: false,
        status: 'NOT_RELEASED',
        finalGrade: null,
      });
      expect(prisma.teamFinalScore.findFirst).not.toHaveBeenCalled();
    });

    it('liberada: solo la nota final, sin desglose', async () => {
      prisma.team.findFirst.mockResolvedValue(team(true));
      prisma.teamFinalScore.findFirst.mockResolvedValue({
        ...row(3, { teamCode: 'N2-ISI-014', finalScore: 4.12 }),
        avgJunior: 4.5,
        avgSenior: 3.8,
      });

      const grade = await service.getStudentFinalGrade('u-1');

      expect(grade).toMatchObject({
        released: true,
        status: 'AVAILABLE',
        finalGrade: 4.12,
      });
      expect(grade).not.toHaveProperty('avgJunior');
      expect(grade).not.toHaveProperty('avgSenior');
      expect(prisma.teamFinalScore.findFirst).toHaveBeenCalledWith({
        where: { teamId: 3, editionId: 5 },
      });
    });

    it('liberada sin nota de los profesores: en proceso', async () => {
      prisma.team.findFirst.mockResolvedValue(team(true));
      prisma.teamFinalScore.findFirst.mockResolvedValue(
        row(3, { seniorEvaluations: 0 }),
      );
      await expect(service.getStudentFinalGrade('u-1')).resolves.toMatchObject({
        status: 'IN_PROCESS',
        finalGrade: null,
      });
    });

    it('edición sin configuración: no liberada', async () => {
      prisma.team.findFirst.mockResolvedValue(team(null));
      await expect(service.getStudentFinalGrade('u-1')).resolves.toMatchObject({
        released: false,
        status: 'NOT_RELEASED',
      });
    });
  });
});
