import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CriterionService } from '../src/criterion/criterion.service';
import { BatchEvaluationDto } from '../src/evaluation/dto/batchEvaluation.dto';
import { EvaluationService } from '../src/evaluation/evaluation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TeamVerificationService } from '../src/team-verification/team-verification.service';

type BatchResponse = {
  results: { successful: unknown[]; failed: unknown[] };
};

/**
 * Integración contra PostgreSQL real del lote idempotente (ARK-92).
 * Los mocks no detectan que Prisma no puede leer el resultado `void` de
 * pg_advisory_xact_lock con $queryRaw; aquí se ejecuta el lock de verdad.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con las
 * migraciones y el seed aplicados (necesita edición activa, criterios activos,
 * rol "Jurado", evaluaciones abiertas y al menos dos videojuegos). Crea sus
 * propios jurados y borra al final todo lo que generó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb('EvaluationService batch idempotency (PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const service = new EvaluationService(
    prisma as unknown as PrismaService,
    {} as CriterionService,
    new TeamVerificationService(prisma as unknown as PrismaService),
  );
  const runId = Date.now().toString(36);
  const jurorIds: string[] = [];
  let teamIds: number[] = [];
  let payload: BatchEvaluationDto;

  const send = (jurorId: string, body: BatchEvaluationDto = payload) =>
    service.createBatchEvaluations(
      jurorId,
      body,
      'key-1',
    ) as Promise<BatchResponse>;

  async function createJuror(suffix: string) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'Jurado' },
    });
    const juror = await prisma.user.create({
      data: {
        id: `it-ark92-${runId}-${suffix}`,
        email: `it-ark92-${runId}-${suffix}@uninorte.edu.co`,
        roleId: role.id,
        firstName: 'IT',
        lastName: 'ARK92',
      },
    });
    jurorIds.push(juror.id);
    // HU-19: el jurado ya digitó el código de los grupos que va a calificar
    await prisma.teamVerification.createMany({
      data: teamIds.map((teamId) => ({ teamId, jurorId: juror.id })),
    });
    return juror.id;
  }

  const countEvaluations = (jurorId: string) =>
    prisma.evaluation.count({ where: { jurorId } });

  beforeAll(async () => {
    const config = await prisma.eventConfiguration.findFirst();
    if (!config?.evaluationsOpen) {
      throw new Error('La base de prueba debe tener evaluaciones abiertas.');
    }
    const criteria = await prisma.criterion.findMany({
      where: { isActive: true },
    });
    const videogames = await prisma.videogame.findMany({
      take: 2,
      orderBy: { id: 'asc' },
    });
    if (videogames.length < 2) {
      throw new Error('La base de prueba necesita al menos dos videojuegos.');
    }
    teamIds = videogames.map((v) => v.teamId);
    const now = '2026-11-26T10:00:00.000Z';
    payload = {
      evaluations: videogames.map((v) => ({
        videogameId: v.id,
        date: now,
        comments: `it-${v.id}`,
        details: criteria.map((c) => ({
          criterionId: c.id,
          score: 4,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })),
      })),
    };
  });

  afterAll(async () => {
    const evaluations = await prisma.evaluation.findMany({
      where: { jurorId: { in: jurorIds } },
      select: { id: true },
    });
    await prisma.evaluationDetail.deleteMany({
      where: { evaluationId: { in: evaluations.map((e) => e.id) } },
    });
    await prisma.evaluation.deleteMany({
      where: { jurorId: { in: jurorIds } },
    });
    await prisma.evaluationIdempotency.deleteMany({
      where: { jurorId: { in: jurorIds } },
    });
    await prisma.teamVerification.deleteMany({
      where: { jurorId: { in: jurorIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: jurorIds } } });
    await prisma.$disconnect();
  });

  it('guarda el lote con Idempotency-Key y la repetición devuelve lo mismo sin duplicar', async () => {
    const jurorId = await createJuror('a');

    const first = await send(jurorId);
    expect(first.results.successful).toHaveLength(2);
    expect(first.results.failed).toEqual([]);

    const replay = await send(jurorId);
    expect(replay).toEqual(first);
    expect(await countEvaluations(jurorId)).toBe(2);
    expect(
      await prisma.evaluationIdempotency.count({ where: { jurorId } }),
    ).toBe(1);
  });

  it('rechaza la misma llave con contenido distinto', async () => {
    const jurorId = await createJuror('b');
    await send(jurorId);

    await expect(
      send(jurorId, { evaluations: [payload.evaluations[0]] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await countEvaluations(jurorId)).toBe(2);
  });

  it('serializa dos envíos simultáneos con la misma llave', async () => {
    const jurorId = await createJuror('c');

    const [a, b] = await Promise.all([send(jurorId), send(jurorId)]);

    expect(a).toEqual(b);
    expect(await countEvaluations(jurorId)).toBe(2);
  });
});
