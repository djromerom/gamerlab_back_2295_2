import { ConflictException } from '@nestjs/common';
import { EditionStatus, JurorCategory, PrismaClient } from '@prisma/client';
import { CriterionService } from '../src/criterion/criterion.service';
import { BatchEvaluationDto } from '../src/evaluation/dto/batchEvaluation.dto';
import { CreateEvaluationDto } from '../src/evaluation/dto/createEvaluation.dto';
import { EvaluationService } from '../src/evaluation/evaluation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TeamVerificationService } from '../src/team-verification/team-verification.service';

type BatchResponse = {
  results: {
    successful: { videogameId: number; evaluationId: number }[];
    failed: { videogameId: number; error: string }[];
  };
  message: string;
};

/**
 * Integración contra PostgreSQL real del lote idempotente (ARK-92) y de las
 * correcciones ARK-SP1 (U1: quién califica; U2: el lote no pierde notas).
 * Los mocks no detectan que Prisma no puede leer el resultado `void` de
 * pg_advisory_xact_lock con $queryRaw; aquí se ejecuta el lock de verdad.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con las
 * migraciones y el seed aplicados (necesita edición activa, una edición
 * archivada, criterios activos, roles "Jurado" y "Estudiante", evaluaciones
 * abiertas, al menos dos videojuegos de equipos activos (no colegios) y uno de
 * colegios (N0) en la edición activa). Crea sus propios jurados (y un equipo en
 * la edición archivada) y borra al final todo lo que generó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb('EvaluationService batch idempotency (PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const service = new EvaluationService(
    prisma as unknown as PrismaService,
    {
      findForSelect: () =>
        prisma.criterion.findMany({
          where: { isActive: true },
          select: { id: true, name: true, weight: true, description: true },
        }),
    } as unknown as CriterionService,
    new TeamVerificationService(prisma as unknown as PrismaService),
  );
  const runId = Date.now().toString(36);
  const jurorIds: string[] = [];
  const createdUserIds: string[] = [];
  let teamIds: number[] = [];
  let criteriaIds: number[] = [];
  let collegeVideogame: { id: number; teamId: number };
  let archivedVideogame: { id: number; teamId: number } | undefined;
  let payload: BatchEvaluationDto;

  const send = (
    jurorId: string,
    body: BatchEvaluationDto = payload,
    key: string | undefined = 'key-1',
  ) =>
    service.createBatchEvaluations(
      jurorId,
      body,
      key,
    ) as Promise<BatchResponse>;

  const now = '2026-11-26T10:00:00.000Z';
  const row = (videogameId: number): CreateEvaluationDto => ({
    videogameId,
    date: now,
    comments: `it-${videogameId}`,
    details: criteriaIds.map((criterionId) => ({
      criterionId,
      score: 4,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })),
  });

  async function createJuror(
    suffix: string,
    {
      assignTo = teamIds,
      verify = teamIds,
      category = null,
    }: {
      assignTo?: number[];
      verify?: number[];
      category?: JurorCategory | null;
    } = {},
  ) {
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
        jurorCategory: category,
        // U1: el jurado califica solo los grupos que tiene asignados
        teamsToEvaluate: { connect: assignTo.map((id) => ({ id })) },
      },
    });
    jurorIds.push(juror.id);
    // HU-19: el jurado ya digitó el código de los grupos que va a calificar
    await prisma.teamVerification.createMany({
      data: verify.map((teamId) => ({ teamId, jurorId: juror.id })),
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
    criteriaIds = criteria.map((c) => c.id);
    const activeTeam = {
      isActive: true,
      edition: { status: EditionStatus.ACTIVE },
    };
    const videogames = await prisma.videogame.findMany({
      where: {
        team: { ...activeTeam, NOT: { teamCode: { startsWith: 'N0-' } } },
      },
      take: 2,
      orderBy: { id: 'asc' },
    });
    if (videogames.length < 2) {
      throw new Error('La base de prueba necesita al menos dos videojuegos.');
    }
    const college = await prisma.videogame.findFirst({
      where: { team: { ...activeTeam, teamCode: { startsWith: 'N0-' } } },
    });
    if (!college) {
      throw new Error('La base de prueba necesita un equipo de colegios (N0).');
    }
    collegeVideogame = { id: college.id, teamId: college.teamId };
    teamIds = videogames.map((v) => v.teamId);
    payload = { evaluations: videogames.map((v) => row(v.id)) };

    // Juego de una feria archivada (U1, regla 2)
    const archived = await prisma.edition.findFirst({
      where: { status: EditionStatus.ARCHIVED },
    });
    if (archived) {
      const studentRole = await prisma.role.findUniqueOrThrow({
        where: { name: 'Estudiante' },
      });
      const owner = await prisma.user.create({
        data: {
          id: `it-sp1-${runId}-owner`,
          email: `it-sp1-${runId}-owner@uninorte.edu.co`,
          roleId: studentRole.id,
          firstName: 'IT',
          lastName: 'SP1',
        },
      });
      createdUserIds.push(owner.id);
      const team = await prisma.team.create({
        data: {
          teamName: `it-sp1-${runId}`,
          userId: owner.id,
          editionId: archived.id,
          teamCode: `N1-IT-${runId.slice(-5)}`,
          videogame: { create: { name: `it-sp1-${runId}`.slice(0, 30) } },
        },
        include: { videogame: true },
      });
      archivedVideogame = { id: team.videogame!.id, teamId: team.id };
    }
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
    // Las asignaciones (tabla implícita) se borran en cascada con el usuario
    await prisma.user.deleteMany({ where: { id: { in: jurorIds } } });
    if (archivedVideogame) {
      await prisma.team.delete({ where: { id: archivedVideogame.teamId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
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

  // --- U1 ---------------------------------------------------------------

  it('U1: un grupo no asignado al jurado se rechaza por fila y no se guarda', async () => {
    const jurorId = await createJuror('u1-asig', { assignTo: [teamIds[0]] });

    const response = await send(jurorId, payload, undefined);

    expect(response.results.successful).toHaveLength(1);
    expect(response.results.failed).toEqual([
      {
        videogameId: payload.evaluations[1].videogameId,
        error: 'Este grupo no está asignado al evaluador',
      },
    ]);
    expect(await countEvaluations(jurorId)).toBe(1);
  });

  it('U1: un jurado junior no califica un equipo de colegios aunque esté asignado', async () => {
    const jurorId = await createJuror('u1-n0', {
      assignTo: [collegeVideogame.teamId],
      verify: [],
      category: JurorCategory.JUNIOR,
    });

    const response = await send(
      jurorId,
      { evaluations: [row(collegeVideogame.id)] },
      undefined,
    );

    expect(response.results.failed).toEqual([
      {
        videogameId: collegeVideogame.id,
        error: 'Los equipos de colegios solo los califica un evaluador senior',
      },
    ]);
    expect(await countEvaluations(jurorId)).toBe(0);
  });

  it('U1: un jurado senior asignado sí califica un equipo de colegios', async () => {
    const jurorId = await createJuror('u1-n0s', {
      assignTo: [collegeVideogame.teamId],
      verify: [],
      category: JurorCategory.SENIOR,
    });

    const response = await send(
      jurorId,
      { evaluations: [row(collegeVideogame.id)] },
      undefined,
    );

    expect(response.results.failed).toEqual([]);
    expect(await countEvaluations(jurorId)).toBe(1);
  });

  it('U1: un juego de una feria archivada se rechaza (lote e individual)', async () => {
    if (!archivedVideogame) return; // la base no tiene edición archivada
    const jurorId = await createJuror('u1-arch', {
      assignTo: [archivedVideogame.teamId],
      verify: [archivedVideogame.teamId],
    });
    const message = 'El videojuego no pertenece a la edición activa';

    const response = await send(
      jurorId,
      { evaluations: [row(archivedVideogame.id)] },
      undefined,
    );
    expect(response.results.failed).toEqual([
      { videogameId: archivedVideogame.id, error: message },
    ]);

    await expect(
      service.createEvaluationWithDetails(jurorId, row(archivedVideogame.id)),
    ).rejects.toThrow(message);
    expect(await countEvaluations(jurorId)).toBe(0);
  });

  // --- U2 / I10 ---------------------------------------------------------

  it('U2: con una fila válida y otra con criterio inválido, la válida se guarda y se informa', async () => {
    const jurorId = await createJuror('u2-mix');
    const invalid = row(payload.evaluations[1].videogameId);
    invalid.details = [
      ...invalid.details,
      { ...invalid.details[0], criterionId: 999999 },
    ];

    const response = await send(jurorId, {
      evaluations: [payload.evaluations[0], invalid],
    });

    expect(response.results.successful).toHaveLength(1);
    expect(response.results.failed).toHaveLength(1);
    expect(response.results.failed[0].error).not.toContain('prisma');
    expect(await countEvaluations(jurorId)).toBe(1);

    // La misma llave tras el fallo parcial: misma respuesta, sin duplicar
    const replay = await send(jurorId, {
      evaluations: [payload.evaluations[0], invalid],
    });
    expect(replay).toEqual(response);
    expect(await countEvaluations(jurorId)).toBe(1);
  });

  it('I10: un juego inexistente devuelve un mensaje propio y no el texto de Prisma', async () => {
    const jurorId = await createJuror('i10');

    const response = await send(
      jurorId,
      { evaluations: [row(987654321)] },
      undefined,
    );

    expect(response.results.failed).toEqual([
      {
        videogameId: 987654321,
        error: 'El videojuego no existe o está inactivo',
      },
    ]);
    expect(JSON.stringify(response)).not.toContain('Invalid `prisma');
  });
});
