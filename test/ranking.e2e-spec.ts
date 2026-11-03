import { EditionStatus, PrismaClient } from '@prisma/client';
import { ROLE_IDS } from '../src/auth/constants/roles';
import { PrismaService } from '../src/prisma/prisma.service';
import { RankingService } from '../src/ranking/ranking.service';
import { blobRefsPassthrough } from '../src/upload/blob-reference.mock';

/**
 * HU-04 (ARK-98) contra PostgreSQL real: la vista `vw_team_final_scores` (3 primeras evaluaciones,
 * sin penalizar notas faltantes, ponderación de la edición, 2 decimales), los empates por nivel,
 * la decisión del profesor y el cierre en `resultado_ranking`.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed
 * (necesita los roles Profesor, Jurado y Estudiante). Crea su propia edición (inactiva) con sus
 * equipos y borra al final todo lo que generó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb('Ranking por nivel y desempate (PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const service = new RankingService(
    prisma as unknown as PrismaService,
    blobRefsPassthrough(),
  );
  const runId = Date.now().toString(36).slice(-5);
  const userIds: string[] = [];
  let editionId: number;
  let subjectId: number;
  const nrcIds: number[] = [];
  const team: Record<string, { id: number; videogameId: number }> = {};
  let profA: string;
  let profB: string;
  const jurors: string[] = [];

  async function user(suffix: string, role: string) {
    const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    const u = await prisma.user.create({
      data: {
        id: `it-ark98-${runId}-${suffix}`,
        email: `it-ark98-${runId}-${suffix}@uninorte.edu.co`,
        roleId: r.id,
        firstName: 'IT',
        lastName: suffix,
      },
    });
    userIds.push(u.id);
    return u.id;
  }

  async function nrc(professorId: string) {
    const n = await prisma.nRC.create({
      data: { code: 980000 + nrcIds.length, subjectId, professorId, editionId },
    });
    nrcIds.push(n.id);
    return n.id;
  }

  async function createTeam(
    key: string,
    level: number,
    nrcId: number | null,
    day: number,
    isExternal = false,
  ) {
    const owner = await user(`own-${key}`, 'Estudiante');
    const t = await prisma.team.create({
      data: {
        teamName: `it-ark98-${runId}-${key}`,
        userId: owner,
        editionId,
        isExternal,
        teamCode: `N${level}-IT-${runId}${key}`.slice(0, 12),
        registrationDate: new Date(Date.UTC(2099, 0, day, 15)),
        videogame: { create: { name: `it-ark98-${runId}-${key}` } },
        members: {
          create: {
            firstName: 'IT',
            lastName: key,
            email: `it-ark98-${runId}-mem-${key}@uninorte.edu.co`,
            studentCode: `it98${runId}${key}`,
            ...(nrcId ? { nrcs: { connect: { id: nrcId } } } : {}),
          },
        },
      },
      include: { videogame: true },
    });
    team[key] = { id: t.id, videogameId: t.videogame!.id };
  }

  async function evaluate(
    key: string,
    jurorId: string,
    totalScore: number,
    minute: number,
    isSenior = false,
    isActive = true,
  ) {
    await prisma.evaluation.create({
      data: {
        jurorId,
        videogameId: team[key].videogameId,
        editionId,
        totalScore,
        isSenior,
        isActive,
        date: new Date(Date.UTC(2099, 0, 20, 10, minute)),
      },
    });
  }

  const scoreOf = async (key: string) =>
    prisma.teamFinalScore.findFirstOrThrow({ where: { teamId: team[key].id } });

  beforeAll(async () => {
    const edition = await prisma.edition.create({
      data: {
        year: 2099,
        semester: 10 + (Date.now() % 7),
        title: `it-ark98-${runId}`,
        startsAt: new Date(Date.UTC(2099, 0, 1)),
        endsAt: new Date(Date.UTC(2099, 0, 31)),
        status: EditionStatus.INACTIVE,
      },
    });
    editionId = edition.id;
    await prisma.weighting.create({
      data: { editionId, juniorPct: 40, seniorPct: 60 },
    });
    const subject = await prisma.subject.create({
      data: { name: `it-ark98-${runId}`, code: `IT98${runId}`, semester: 1 },
    });
    subjectId = subject.id;

    profA = await user('pa', 'Profesor');
    profB = await user('pb', 'Profesor');
    for (let i = 0; i < 4; i++) jurors.push(await user(`j${i}`, 'Jurado'));
    const nrcA = await nrc(profA);
    const nrcB = await nrc(profB);

    // N1
    await createTeam('A', 1, nrcA, 5);
    await createTeam('B', 1, nrcA, 3);
    await createTeam('C', 1, nrcB, 1);
    // N2
    await createTeam('D', 2, nrcA, 4, true);
    await createTeam('E', 2, nrcB, 6);
    await createTeam('F', 2, nrcB, 2);

    // A: 4 evaluaciones de jurado; solo cuentan las 3 primeras por fecha (5, 4, 3 → 4). Profesor 3.
    //    Final = (4·40 + 3·60) / 100 = 3.4
    await evaluate('A', jurors[3], 1, 40); // la última en llegar: no cuenta
    await evaluate('A', jurors[0], 5, 10);
    await evaluate('A', jurors[1], 4, 20);
    await evaluate('A', jurors[2], 3, 30);
    await evaluate('A', profA, 3, 50, true);
    // B: solo jurados (3.4); sin nota del profesor no se cuenta como 0. Empata con A (mismo profesor).
    await evaluate('B', jurors[0], 3.4, 11);
    await evaluate('B', jurors[1], 3.4, 12);
    await evaluate('B', jurors[2], 3.4, 13);
    // C: solo profesor 4.555 → 4.56; una evaluación inactiva no cuenta.
    await evaluate('C', profB, 4.555, 14, true);
    await evaluate('C', jurors[0], 0, 15, false, false);
    // D (externo): solo cuenta la nota junior (3), aunque tenga nota senior.
    await evaluate('D', jurors[0], 2.5, 16);
    await evaluate('D', jurors[1], 3.5, 17);
    await evaluate('D', profA, 5, 18, true);
    // E: sin notas. F: 3 y 3 → 3, empata con D (profesores distintos → inscripción: F el día 2).
    await evaluate('F', jurors[0], 3, 19);
    await evaluate('F', profB, 3, 21, true);
  });

  afterAll(async () => {
    if (editionId) {
      await prisma.evaluation.deleteMany({ where: { editionId } });
      await prisma.team.deleteMany({ where: { editionId } });
      await prisma.nRC.deleteMany({ where: { id: { in: nrcIds } } });
      // decision_desempate, resultado_ranking y ponderado: en cascada o directo con la edición
      await prisma.tieBreakDecision.deleteMany({ where: { editionId } });
      await prisma.rankingResult.deleteMany({ where: { editionId } });
      await prisma.weighting.deleteMany({ where: { editionId } });
      await prisma.edition.delete({ where: { id: editionId } });
    }
    if (subjectId) await prisma.subject.delete({ where: { id: subjectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('la vista cuenta solo las 3 primeras evaluaciones de jurado y pondera con la edición', async () => {
    expect(await scoreOf('A')).toMatchObject({
      avgJunior: 4,
      avgSenior: 3,
      finalScore: 3.4,
      juniorEvaluations: 4,
      juniorCounted: 3,
      seniorEvaluations: 1,
      weightingConfigured: true,
    });
  });

  it('un grupo de notas que falta no cuenta como 0', async () => {
    expect(await scoreOf('B')).toMatchObject({
      avgSenior: null,
      finalScore: 3.4,
    });
    expect(await scoreOf('C')).toMatchObject({
      avgJunior: null,
      finalScore: 4.56,
      juniorEvaluations: 0,
    });
    expect(await scoreOf('E')).toMatchObject({
      finalScore: null,
      juniorEvaluations: 0,
      seniorEvaluations: 0,
    });
  });

  it('los equipos externos cuentan solo la nota junior', async () => {
    expect(await scoreOf('D')).toMatchObject({ finalScore: 3, avgSenior: 5 });
  });

  it('arma el ranking por nivel con los empates y su regla', async () => {
    const r = await service.getRanking({ editionId });
    expect(r.weighting).toEqual({
      configured: true,
      juniorPct: 40,
      seniorPct: 60,
    });
    const [n1, n2] = r.levels;
    expect(n1.label).toBe('N1');
    expect(n1.teams.map((t) => t.teamId)).toEqual([
      team.C.id,
      team.B.id,
      team.A.id,
    ]);
    expect(n1.ties).toHaveLength(1);
    expect(n1.ties[0]).toMatchObject({
      rule: 'PROFESSOR',
      status: 'PENDING',
      score: 3.4,
      positions: [2, 3],
      deciders: [{ id: profA, name: 'IT pa' }],
    });
    expect(n1.teams[0]).toMatchObject({
      lessThanMinEvaluations: true,
      missingProfessorScore: false,
    });
    expect(n1.teams.find((t) => t.teamId === team.A.id)).toMatchObject({
      juniorNotCounted: 1,
    });

    expect(n2.teams.map((t) => t.teamId)).toEqual([team.F.id, team.D.id]);
    expect(n2.ties[0]).toMatchObject({
      rule: 'REGISTRATION',
      status: 'RESOLVED',
    });
    expect(n2.withoutScore.map((t) => t.teamId)).toEqual([team.E.id]);
  });

  it('la decisión se registra y el cierre guarda las posiciones por nivel', async () => {
    const [n1] = (await service.getRanking({ editionId, level: 1 })).levels;
    const admin = { id: profB, roleId: ROLE_IDS.ADMIN } as any; // cualquier usuario real sirve de autor

    // El profesor solo decide en la edición activa (lo cubre ranking.service.spec.ts); esta prueba
    // usa su propia edición inactiva, así que decide el administrador indicando la edición.
    await expect(service.finalize(admin, editionId)).rejects.toMatchObject({
      status: 409,
    });
    const decision = await service.decide(admin, {
      tieKey: n1.ties[0].tieKey,
      orderedTeamIds: [team.A.id, team.B.id],
      reason: 'Prueba de integración',
      editionId,
    });
    expect(decision.method).toBe('ADMIN');

    const done = await service.finalize(admin, editionId);
    expect(done).toMatchObject({ editionId, teams: 5, registeredDecisions: 1 });

    const saved = await prisma.rankingResult.findMany({
      where: { editionId },
      orderBy: [{ level: 'asc' }, { finalPosition: 'asc' }],
    });
    expect(
      saved.map((s) => [
        s.level,
        s.teamId,
        s.finalPosition,
        s.wasTied,
        s.baseScore,
      ]),
    ).toEqual([
      [1, team.C.id, 1, false, 4.56],
      [1, team.A.id, 2, true, 3.4],
      [1, team.B.id, 3, true, 3.4],
      [2, team.F.id, 1, true, 3],
      [2, team.D.id, 2, true, 3],
    ]);

    const decisions = await service.getDecisions(editionId);
    expect(decisions.map((d) => d.method).sort()).toEqual([
      'ADMIN',
      'REGISTRATION',
    ]);
    expect((await service.getRanking({ editionId })).finalized).toMatchObject({
      matchesCurrent: true,
    });
  });
});
