import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import {
  DRAFT_VERSION_CONFLICT,
  EVALUATION_ALREADY_SUBMITTED,
  EvaluationDraftsService,
} from './evaluation-drafts.service';

/** HU-18 (ARK-104): reglas del servicio de borradores con la BD simulada. */
describe('EvaluationDraftsService (HU-18)', () => {
  const JUROR = 'juror-1';
  const VG = 10;
  const now = new Date('2026-11-26T10:00:00Z');

  const row = (over: Record<string, unknown> = {}) => ({
    id: 1,
    jurorId: JUROR,
    videogameId: VG,
    editionId: 7,
    scores: [{ criterionId: 1, score: 4 }],
    comments: 'va bien',
    version: 2,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    videogame: {
      name: 'Juego',
      team: { id: 3, teamName: 'Equipo', teamCode: 'N1-01' },
    },
    ...over,
  });

  function setup(blockers = new Map<number, string>()) {
    const prisma: any = {
      edition: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 7, status: EditionStatus.ACTIVE }),
      },
      evaluation: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      criterion: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]),
      },
      evaluationDraft: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row()),
        findFirst: jest.fn().mockResolvedValue(row()),
        findMany: jest.fn().mockResolvedValue([row()]),
      },
    };
    const evaluations: any = {
      loadActor: jest.fn().mockResolvedValue({
        actor: { id: JUROR, roleId: 4, jurorCategory: 'JUNIOR' },
        professorRoleId: 2,
      }),
      findEvaluationBlockers: jest.fn().mockResolvedValue(blockers),
    };
    return {
      service: new EvaluationDraftsService(prisma, evaluations),
      prisma,
      evaluations,
    };
  }

  describe('save', () => {
    it('guarda notas incompletas (no exige todos los criterios) y devuelve la nueva versión', async () => {
      const { service, prisma } = setup();
      const draft = await service.save(JUROR, VG, {
        version: 2,
        details: [{ criterionId: 1, score: 4 }],
        comments: 'va bien',
      });

      expect(prisma.evaluationDraft.updateMany).toHaveBeenCalledWith({
        where: { jurorId: JUROR, videogameId: VG, isActive: true, version: 2 },
        data: {
          scores: [{ criterionId: 1, score: 4 }],
          comments: 'va bien',
          editionId: 7,
          version: { increment: 1 },
        },
      });
      expect(draft).toMatchObject({
        videogameId: VG,
        teamId: 3,
        version: 2,
        status: 'PENDING',
        details: [{ criterionId: 1, score: 4 }],
      });
    });

    it('version 0 sin borrador previo: lo crea', async () => {
      const { service, prisma } = setup();
      prisma.evaluationDraft.updateMany.mockResolvedValue({ count: 0 });

      await service.save(JUROR, VG, { version: 0 });

      expect(prisma.evaluationDraft.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jurorId: JUROR, videogameId: VG, isActive: false },
        }),
      );
      expect(prisma.evaluationDraft.create).toHaveBeenCalledWith({
        data: {
          jurorId: JUROR,
          videogameId: VG,
          scores: [],
          comments: null,
          editionId: 7,
        },
      });
    });

    it('version 0 con un borrador descartado: lo reactiva sin crear otro', async () => {
      const { service, prisma } = setup();

      await service.save(JUROR, VG, { version: 0 });

      expect(prisma.evaluationDraft.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: true,
            version: { increment: 1 },
          }),
        }),
      );
      expect(prisma.evaluationDraft.create).not.toHaveBeenCalled();
    });

    it('version 0 cuando ya hay uno activo (otra pestaña): 409 DRAFT_VERSION_CONFLICT con el actual', async () => {
      const { service, prisma } = setup();
      prisma.evaluationDraft.updateMany.mockResolvedValue({ count: 0 });
      prisma.evaluationDraft.create.mockRejectedValue({ code: 'P2002' });

      const error = await service
        .save(JUROR, VG, { version: 0 })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        code: DRAFT_VERSION_CONFLICT,
        draft: { version: 2, status: 'PENDING' },
      });
    });

    it('un autoguardado atrasado (versión vieja) no pisa el borrador: 409', async () => {
      const { service, prisma } = setup();
      prisma.evaluationDraft.updateMany.mockResolvedValue({ count: 0 });

      const error = await service
        .save(JUROR, VG, { version: 1 })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse().code).toBe(DRAFT_VERSION_CONFLICT);
      expect(prisma.evaluationDraft.create).not.toHaveBeenCalled();
    });

    it('un error de BD distinto al duplicado no se convierte en conflicto', async () => {
      const { service, prisma } = setup();
      prisma.evaluationDraft.updateMany.mockResolvedValue({ count: 0 });
      prisma.evaluationDraft.create.mockRejectedValue(new Error('db down'));

      await expect(service.save(JUROR, VG, { version: 0 })).rejects.toThrow(
        'db down',
      );
    });

    it('juego no asignado (o de otra edición, o colegios): 403 con el mismo texto del envío y no escribe', async () => {
      const { service, prisma } = setup(
        new Map([[VG, 'Este grupo no está asignado al evaluador']]),
      );

      await expect(service.save(JUROR, VG, { version: 0 })).rejects.toThrow(
        new ForbiddenException('Este grupo no está asignado al evaluador'),
      );
      expect(prisma.evaluationDraft.updateMany).not.toHaveBeenCalled();
    });

    it('si ya envió la evaluación: 409 EVALUATION_ALREADY_SUBMITTED y no escribe', async () => {
      const { service, prisma } = setup();
      prisma.evaluation.findUnique.mockResolvedValue({ id: 99 });

      const error = await service
        .save(JUROR, VG, { version: 2 })
        .catch((e) => e);

      expect(error.getResponse()).toMatchObject({
        code: EVALUATION_ALREADY_SUBMITTED,
        evaluationId: 99,
      });
      expect(prisma.evaluationDraft.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      [[{ criterionId: 9, score: 3 }], /not valid or not active/],
      [
        [
          { criterionId: 1, score: 3 },
          { criterionId: 1, score: 4 },
        ],
        /repetido/,
      ],
      [[{ criterionId: 1, score: 6 }], /out of range/],
      [[{ criterionId: 1, score: 3.333 }], /2 decimales/],
    ])('rechaza %j con 400', async (details, message) => {
      const { service, prisma } = setup();

      const error = await service
        .save(JUROR, VG, { version: 2, details })
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toMatch(message);
      expect(prisma.evaluationDraft.updateMany).not.toHaveBeenCalled();
    });

    it('sin edición activa: 400', async () => {
      const { service, prisma } = setup();
      prisma.edition.findFirst.mockResolvedValue(null);

      await expect(
        service.save(JUROR, VG, { version: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no mira si las evaluaciones están abiertas ni si se digitó el código (HU-19)', async () => {
      const { service, prisma } = setup();
      prisma.eventConfiguration = { findFirst: jest.fn() };
      prisma.teamVerification = { findUnique: jest.fn() };

      await service.save(JUROR, VG, { version: 2 });

      expect(prisma.eventConfiguration.findFirst).not.toHaveBeenCalled();
      expect(prisma.teamVerification.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('list y findOne', () => {
    it('lista solo los activos de la edición activa, con su estado A1', async () => {
      const { service, prisma, evaluations } = setup(
        new Map([[12, 'Este grupo no está asignado al evaluador']]),
      );
      prisma.evaluationDraft.findMany.mockResolvedValue([
        row(),
        row({ id: 2, videogameId: 11 }),
        row({ id: 3, videogameId: 12 }),
      ]);
      prisma.evaluation.findMany.mockResolvedValue([{ videogameId: 11 }]);

      const drafts = await service.list(JUROR);

      expect(prisma.evaluationDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jurorId: JUROR, isActive: true, editionId: 7 },
        }),
      );
      expect(evaluations.findEvaluationBlockers).toHaveBeenCalledTimes(1);
      expect(
        drafts.map((d) => [d.videogameId, d.status, d.blockedReason]),
      ).toEqual([
        [10, 'PENDING', undefined],
        [11, 'ALREADY_SUBMITTED', undefined],
        [12, 'NOT_ASSIGNED', 'Este grupo no está asignado al evaluador'],
      ]);
    });

    it('sin edición activa la lista es vacía', async () => {
      const { service, prisma } = setup();
      prisma.edition.findFirst.mockResolvedValue(null);

      expect(await service.list(JUROR)).toEqual([]);
      expect(prisma.evaluationDraft.findMany).not.toHaveBeenCalled();
    });

    it('findOne sin borrador activo devuelve { draft: null }', async () => {
      const { service, prisma } = setup();
      prisma.evaluationDraft.findFirst.mockResolvedValue(null);

      expect(await service.findOne(JUROR, VG)).toEqual({ draft: null });
    });

    it('findOne solo busca borradores del jurado de la sesión', async () => {
      const { service, prisma } = setup();

      await service.findOne(JUROR, VG);

      expect(prisma.evaluationDraft.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jurorId: JUROR, videogameId: VG, isActive: true },
        }),
      );
    });
  });

  describe('discard', () => {
    it('borrado lógico que sube la versión', async () => {
      const { service, prisma } = setup();

      expect(await service.discard(JUROR, VG)).toEqual({ discarded: true });
      expect(prisma.evaluationDraft.updateMany).toHaveBeenCalledWith({
        where: { jurorId: JUROR, videogameId: VG, isActive: true },
        data: { isActive: false, version: { increment: 1 } },
      });
    });

    it('idempotente: sin borrador activo, discarded false', async () => {
      const { service, prisma } = setup();
      prisma.evaluationDraft.updateMany.mockResolvedValue({ count: 0 });

      expect(await service.discard(JUROR, VG)).toEqual({ discarded: false });
    });
  });
});
