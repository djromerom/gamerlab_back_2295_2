import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import {
  JurorSurveyService,
  SURVEY_ALREADY_ANSWERED,
  SURVEY_NOT_AVAILABLE,
} from './juror-survey.service';

/** HU-17 (ARK-183): reglas del servicio de la encuesta con la BD simulada. */
describe('JurorSurveyService (HU-17)', () => {
  const USER = 'juror-1';
  const answer = {
    loginEase: 5,
    groupsClarity: 4,
    gradingEase: 4,
    stability: 3,
    fairOrganization: 5,
    overall: 4,
  };
  const edition = {
    id: 7,
    title: 'Feria',
    status: EditionStatus.ACTIVE,
    year: 2026,
    semester: 30,
    endsAt: new Date(),
  };
  const evaluated = { evaluations: [{ id: 1 }] };
  const pending = { evaluations: [] };

  function setup(
    games: { evaluations: { id: number }[] }[] = [evaluated, evaluated],
  ) {
    const prisma: any = {
      edition: {
        findFirst: jest.fn().mockResolvedValue(edition),
        findUnique: jest.fn().mockResolvedValue(edition),
      },
      user: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn() },
      videogame: { findMany: jest.fn().mockResolvedValue(games) },
      jurorSurveyResponse: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 1, createdAt: new Date() }),
      },
    };
    return { service: new JurorSurveyService(prisma), prisma };
  }

  describe('status', () => {
    it('disponible cuando todos sus grupos tienen evaluación enviada', async () => {
      const { service } = setup();
      expect(await service.status(USER)).toEqual({
        editionId: 7,
        available: true,
        reason: null,
        answered: false,
        answeredAt: null,
        assigned: 2,
        evaluated: 2,
      });
    });

    it('con un grupo pendiente no está disponible', async () => {
      const { service } = setup([evaluated, pending]);
      expect(await service.status(USER)).toMatchObject({
        available: false,
        reason: 'PENDING_EVALUATIONS',
        assigned: 2,
        evaluated: 1,
      });
    });

    it('solo cuenta equipos y juegos activos de la edición activa asignados al jurado', async () => {
      const { service, prisma } = setup();
      await service.status(USER);
      expect(prisma.videogame.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          videogameStatus: { status: 'CONFIRMADO' },
          team: {
            isActive: true,
            editionId: 7,
            notGradable: false,
            assignedJurors: { some: { id: USER } },
          },
        },
        select: {
          evaluations: {
            where: { jurorId: USER },
            select: { id: true },
            take: 1,
          },
        },
      });
    });

    it('no depende de que las evaluaciones estén abiertas (se responde después de la feria, A1)', async () => {
      const { service, prisma } = setup();
      prisma.eventConfiguration = { findFirst: jest.fn() };
      expect((await service.status(USER)).available).toBe(true);
      expect(prisma.eventConfiguration.findFirst).not.toHaveBeenCalled();
    });

    it('quien no es jurado de la edición no la ve', async () => {
      const { service, prisma } = setup();
      prisma.user.count.mockResolvedValue(0);
      expect((await service.status(USER)).reason).toBe('NOT_EDITION_JUROR');
    });

    it('sin edición activa', async () => {
      const { service, prisma } = setup();
      prisma.edition.findFirst.mockResolvedValue(null);
      expect(await service.status(USER)).toMatchObject({
        editionId: null,
        available: false,
        reason: 'NO_ACTIVE_EDITION',
      });
    });

    it('ya respondida: answered con la fecha', async () => {
      const { service, prisma } = setup();
      const at = new Date('2026-11-26T15:00:00Z');
      prisma.jurorSurveyResponse.findUnique.mockResolvedValue({
        createdAt: at,
      });
      expect(await service.status(USER)).toMatchObject({
        available: false,
        reason: 'ALREADY_ANSWERED',
        answered: true,
        answeredAt: at,
      });
    });
  });

  describe('answer', () => {
    it('guarda la respuesta en la edición activa', async () => {
      const { service, prisma } = setup();
      const res = await service.answer(USER, { ...answer, comments: 'Bien' });
      expect(prisma.jurorSurveyResponse.create).toHaveBeenCalledWith({
        data: { jurorId: USER, editionId: 7, ...answer, comments: 'Bien' },
        select: { id: true, createdAt: true },
      });
      expect(res.message).toMatch(/Gracias/);
    });

    it('comentario vacío se guarda como null', async () => {
      const { service, prisma } = setup();
      await service.answer(USER, { ...answer, comments: '' });
      expect(
        prisma.jurorSurveyResponse.create.mock.calls[0][0].data.comments,
      ).toBeNull();
    });

    it('antes de terminar de evaluar: 403 SURVEY_NOT_AVAILABLE con el motivo', async () => {
      const { service, prisma } = setup([pending]);
      const error = await service.answer(USER, answer).catch((e) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({
        code: SURVEY_NOT_AVAILABLE,
        reason: 'PENDING_EVALUATIONS',
      });
      expect(prisma.jurorSurveyResponse.create).not.toHaveBeenCalled();
    });

    it('segunda vez: 409 SURVEY_ALREADY_ANSWERED', async () => {
      const { service, prisma } = setup();
      prisma.jurorSurveyResponse.findUnique.mockResolvedValue({
        createdAt: new Date(),
      });
      const error = await service.answer(USER, answer).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse().code).toBe(SURVEY_ALREADY_ANSWERED);
      expect(prisma.jurorSurveyResponse.create).not.toHaveBeenCalled();
    });

    it('dos envíos a la vez: el duplicado de la BD también es 409', async () => {
      const { service, prisma } = setup();
      prisma.jurorSurveyResponse.create.mockRejectedValue({ code: 'P2002' });
      const error = await service.answer(USER, answer).catch((e) => e);
      expect(error.getResponse().code).toBe(SURVEY_ALREADY_ANSWERED);
    });
  });

  describe('summary', () => {
    it('totales, promedios y comentarios con el jurado', async () => {
      const { service, prisma } = setup();
      const juror = (name: string) => ({
        firstName: name,
        lastName: 'P',
        email: `${name}@x.co`,
        role: { name: 'Jurado' },
      });
      prisma.jurorSurveyResponse.findMany.mockResolvedValue([
        {
          ...answer,
          comments: 'Mejorar el registro',
          createdAt: new Date(1),
          juror: juror('Ana'),
        },
        {
          ...answer,
          overall: 2,
          comments: null,
          createdAt: new Date(2),
          juror: juror('Luis'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ]);
      prisma.videogame.findMany.mockResolvedValue([
        {
          team: { assignedJurors: [{ id: 'a' }, { id: 'b' }] },
          evaluations: [{ jurorId: 'a' }, { jurorId: 'b' }],
        },
        { team: { assignedJurors: [{ id: 'b' }] }, evaluations: [] },
        {
          team: { assignedJurors: [{ id: 'x' }] },
          evaluations: [{ jurorId: 'x' }],
        },
      ]);

      const summary = await service.summary(7);

      expect(summary.totals).toEqual({
        responses: 2,
        jurorsFinished: 1,
        editionJurors: 3,
      });
      expect(summary.fields.find((f) => f.key === 'overall')).toMatchObject({
        average: 3,
        distribution: { '1': 0, '2': 1, '3': 0, '4': 1, '5': 0 },
      });
      expect(summary.comments).toEqual([
        {
          jurorName: 'Ana P',
          email: 'Ana@x.co',
          role: 'Jurado',
          comments: 'Mejorar el registro',
          createdAt: new Date(1),
        },
      ]);
      expect(prisma.jurorSurveyResponse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { editionId: 7, isActive: true } }),
      );
    });
  });
});
