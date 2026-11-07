import { EditionStatus, JurorType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * HU-34 (ARK-196) contra Postgres real: la nota final de `vw_team_final_scores` con valores conocidos.
 * Es el único cálculo de la nota; por eso se prueba aquí y no con una copia en TypeScript.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Nota final 60/40 en la vista (BD real)', () => {
  const prisma = new PrismaService();
  const tag = randomUUID().slice(0, 6);
  const semester = 900 + Math.floor(Math.random() * 90);
  const editions: number[] = [];
  const users: string[] = [];
  let profs: string[] = [];
  let juniors: string[] = [];
  let teamSeq = 0;

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu34.test`,
        firstName: key,
        lastName: `HU34 ${tag}`,
        roleId: roleRow.id,
      },
      select: { id: true },
    });
    users.push(created.id);
    return created.id;
  };

  const edition = async (
    data: Partial<Prisma.EditionUncheckedCreateInput> = {},
    weights?: { seniorPct: number; juniorPct: number },
  ) => {
    const { id } = await prisma.edition.create({
      data: {
        year: 2090 + editions.length,
        semester,
        title: `HU-34 ${tag}`,
        startsAt: new Date('2090-01-01T00:00:00Z'),
        endsAt: new Date('2090-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
        ...data,
      },
      select: { id: true },
    });
    editions.push(id);
    if (weights)
      await prisma.weighting.create({ data: { editionId: id, ...weights } });
    return id;
  };

  /** Crea un equipo con sus notas y devuelve su fila de la vista. */
  const scoreOf = async (
    editionId: number,
    notes: {
      professors?: number[];
      juniors?: number[];
      code?: string;
      isExternal?: boolean;
    },
  ) => {
    teamSeq += 1;
    const status = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const team = await prisma.team.create({
      data: {
        teamName: `E${teamSeq} ${tag}`,
        teamCode: notes.code ?? `N1-${tag}${teamSeq}`,
        userId: await user(`lider${teamSeq}`, 'Estudiante'),
        editionId,
        isExternal: notes.isExternal ?? false,
        videogame: {
          create: { name: `J${teamSeq} ${tag}`, videogameStatusId: status.id },
        },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    const videogameId = team.videogame!.id;
    const add = (
      jurorId: string,
      score: number,
      isSenior: boolean,
      i: number,
    ) =>
      prisma.evaluation.create({
        data: {
          jurorId,
          videogameId,
          editionId,
          totalScore: score,
          isSenior,
          date: new Date(Date.UTC(2090, 0, 1, 10, i)),
        },
      });
    for (const [i, score] of (notes.juniors ?? []).entries())
      await add(juniors[i], score, false, i);
    for (const [i, score] of (notes.professors ?? []).entries())
      await add(profs[i], score, true, 10 + i);
    return prisma.teamFinalScore.findFirstOrThrow({
      where: { teamId: team.id },
    });
  };

  beforeAll(async () => {
    await prisma.$connect();
    profs = [await user('p1', 'Profesor'), await user('p2', 'Profesor')];
    juniors = [];
    for (const k of ['j1', 'j2', 'j3', 'j4'])
      juniors.push(await user(k, 'Jurado'));
  });

  afterAll(async () => {
    try {
      await prisma.evaluation.deleteMany({
        where: { editionId: { in: editions } },
      });
      await prisma.jurorEdition.deleteMany({
        where: { editionId: { in: editions } },
      });
      await prisma.team.deleteMany({ where: { editionId: { in: editions } } });
      await prisma.weighting.deleteMany({
        where: { editionId: { in: editions } },
      });
      await prisma.edition.deleteMany({ where: { id: { in: editions } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('edición vigente', () => {
    it('ejemplo de HU-34: profesores 4.00 y 5.00, jurados 3.00 y 3.50 → 4.00', async () => {
      const e = await edition({}, { seniorPct: 60, juniorPct: 40 });
      expect(
        await scoreOf(e, { professors: [4, 5], juniors: [3, 3.5] }),
      ).toMatchObject({
        avgSenior: 4.5,
        avgJunior: 3.25,
        finalScore: 4,
        seniorEvaluations: 2,
        juniorEvaluations: 2,
      });
    });

    it('sin fila de ponderado usa 60/40 (por defecto)', async () => {
      const e = await edition();
      expect(await scoreOf(e, { professors: [5], juniors: [3] })).toMatchObject(
        {
          finalScore: 4.2,
          weightingConfigured: false,
          legacyFinalScoreRule: false,
        },
      );
    });

    it('los porcentajes son por edición', async () => {
      const e = await edition({}, { seniorPct: 80, juniorPct: 20 });
      expect(await scoreOf(e, { professors: [5], juniors: [3] })).toMatchObject(
        { finalScore: 4.6, weightingConfigured: true },
      );
    });

    it('solo cuentan los 3 primeros jurados junior; los profesores, todos', async () => {
      const e = await edition();
      const row = await scoreOf(e, {
        juniors: [5, 4, 3, 0], // el cuarto no cuenta → 4
        professors: [2, 3], // → 2.5
      });
      expect(row).toMatchObject({
        avgJunior: 4,
        avgSenior: 2.5,
        finalScore: 3.1,
        juniorEvaluations: 4,
        juniorCounted: 3,
      });
    });

    it('redondea a 2 decimales sobre los promedios sin redondear', async () => {
      const e = await edition();
      // junior 10/3; profesor 4.33: (4.33·60 + 3.3333·40) / 100 = 3.9313…
      expect(
        await scoreOf(e, { juniors: [3, 3, 4], professors: [4.33] }),
      ).toMatchObject({ avgJunior: 3.33, finalScore: 3.93 });
    });

    it('sin jurados junior: «Nota en proceso» (null), con el dato del profesor', async () => {
      const e = await edition();
      expect(await scoreOf(e, { professors: [5] })).toMatchObject({
        finalScore: null,
        avgSenior: 5,
        avgJunior: null,
      });
    });

    it('sin profesores: «Nota en proceso» (null)', async () => {
      const e = await edition();
      expect(await scoreOf(e, { juniors: [4, 4, 4] })).toMatchObject({
        finalScore: null,
        avgJunior: 4,
      });
    });

    it('colegio N0 (solo lo califican profesores, P-08): su nota es la de los profesores', async () => {
      const e = await edition();
      expect(
        await scoreOf(e, { code: `N0-${tag}`, professors: [4.5] }),
      ).toMatchObject({ finalScore: 4.5 });
    });

    it('equipo externo: regla vigente, solo la nota junior', async () => {
      const e = await edition();
      expect(
        await scoreOf(e, {
          isExternal: true,
          juniors: [3],
          professors: [5],
        }),
      ).toMatchObject({ finalScore: 3, avgSenior: 5 });
    });

    it('el tipo en jurado_edicion (oficial o suplente) no cambia la nota', async () => {
      const e = await edition();
      await prisma.jurorEdition.create({
        data: {
          jurorId: juniors[0],
          editionId: e,
          type: JurorType.BACKUP,
        },
      });
      expect(await scoreOf(e, { juniors: [3], professors: [5] })).toMatchObject(
        { finalScore: 4.2 },
      );
    });
  });

  describe('edición congelada (anterior a HU-34)', () => {
    it('sin fila de ponderado sigue en 50/50', async () => {
      const e = await edition({ legacyFinalScoreRule: true });
      expect(await scoreOf(e, { professors: [5], juniors: [3] })).toMatchObject(
        { finalScore: 4, legacyFinalScoreRule: true },
      );
    });

    it('conserva el ponderado que tenía', async () => {
      const e = await edition(
        { legacyFinalScoreRule: true },
        { seniorPct: 30, juniorPct: 70 },
      );
      expect(await scoreOf(e, { professors: [5], juniors: [3] })).toMatchObject(
        { finalScore: 3.6 },
      );
    });

    it('con una sola parte sigue mostrando esa parte', async () => {
      const e = await edition({ legacyFinalScoreRule: true });
      expect(await scoreOf(e, { juniors: [4] })).toMatchObject({
        finalScore: 4,
      });
      expect(await scoreOf(e, { professors: [2] })).toMatchObject({
        finalScore: 2,
      });
    });
  });
});
