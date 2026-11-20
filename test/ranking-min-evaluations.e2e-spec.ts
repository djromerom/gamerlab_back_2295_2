import { EditionStatus, PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RankingService } from '../src/ranking/ranking.service';
import { blobRefsPassthrough } from '../src/upload/blob-reference.mock';

/**
 * BG-68 (ARK-270) contra PostgreSQL real y la vista `vw_team_final_scores`: el mínimo de 3
 * evaluaciones cuenta las evaluaciones de jurados junior y senior. Un equipo con «1 junior ·
 * 2 senior» o «2 junior · 1 senior» no sale marcado «Menos de 3 evaluaciones».
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Crea su propia edición (inactiva) con sus equipos y borra al final todo lo que generó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb(
  'Mínimo de 3 evaluaciones: junior y senior (ARK-270, PostgreSQL)',
  () => {
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    const service = new RankingService(
      prisma as unknown as PrismaService,
      blobRefsPassthrough(),
    );
    const runId = Date.now().toString(36).slice(-5);
    const userIds: string[] = [];
    const nrcIds: number[] = [];
    const videogameOf: Record<string, number> = {};
    let editionId = 0;
    let subjectId = 0;
    let nrcId = 0;
    const juniors: string[] = [];
    const seniors: string[] = [];

    async function user(suffix: string, role: string) {
      const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
      const u = await prisma.user.create({
        data: {
          email: `it-ark270-${runId}-${suffix}@uninorte.edu.co`,
          roleId: r.id,
          firstName: 'IT',
          lastName: suffix,
        },
      });
      userIds.push(u.id);
      return u.id;
    }

    async function createTeam(key: string, day: number) {
      const owner = await user(`own-${key}`, 'Estudiante');
      const t = await prisma.team.create({
        data: {
          teamName: `it-ark270-${runId}-${key}`,
          userId: owner,
          editionId,
          teamCode: `N1-IT-${runId}${key}`.slice(0, 12),
          registrationDate: new Date(Date.UTC(2099, 0, day, 15)),
          videogame: { create: { name: `it-ark270-${runId}-${key}` } },
          members: {
            create: {
              firstName: 'IT',
              lastName: key,
              email: `it-ark270-${runId}-mem-${key}@uninorte.edu.co`,
              studentCode: `it270${runId}${key}`,
              editionId,
              nrcs: { connect: [{ id: nrcId }] },
            },
          },
        },
        include: { videogame: true },
      });
      videogameOf[key] = t.videogame!.id;
    }

    /** `junior` jurados junior y `senior` evaluaciones senior (profesor o jurado senior). */
    async function grade(
      key: string,
      junior: number,
      senior: number,
      score = 4,
    ) {
      let minute = 0;
      const evaluate = (jurorId: string, isSenior: boolean) =>
        prisma.evaluation.create({
          data: {
            jurorId,
            videogameId: videogameOf[key],
            editionId,
            totalScore: score,
            isSenior,
            date: new Date(Date.UTC(2099, 0, 20, 10, minute++)),
          },
        });
      for (let i = 0; i < junior; i++) await evaluate(juniors[i], false);
      for (let i = 0; i < senior; i++) await evaluate(seniors[i], true);
    }

    beforeAll(async () => {
      const edition = await prisma.edition.create({
        data: {
          year: 2099,
          semester: 400 + (Date.now() % 90),
          title: `it-ark270-${runId}`,
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
        data: {
          name: `it-ark270-${runId}`,
          code: `IT270${runId}`,
          semester: 1,
        },
      });
      subjectId = subject.id;
      const professor = await user('prof', 'Profesor');
      const nrc = await prisma.nRC.create({
        data: {
          code: 970000 + (Date.now() % 9000),
          subjectId,
          professorId: professor,
          editionId,
        },
      });
      nrcId = nrc.id;
      nrcIds.push(nrc.id);
      for (let i = 0; i < 3; i++) juniors.push(await user(`j${i}`, 'Jurado'));
      for (let i = 0; i < 3; i++) seniors.push(await user(`s${i}`, 'Profesor'));

      // Solo entran al ranking los equipos con nota junior y senior (HU-34); los que tienen una sola
      // parte quedan «sin nota» y su aviso se cubre en final-grade.logic.spec.ts.
      await createTeam('A', 1); // 3 junior + 1 senior
      await createTeam('B', 2); // 2 junior + 1 senior
      await createTeam('C', 3); // 1 junior + 2 senior
      await createTeam('D', 4); // 1 junior + 1 senior
      await grade('A', 3, 1);
      await grade('B', 2, 1);
      await grade('C', 1, 2);
      await grade('D', 1, 1);
    });

    afterAll(async () => {
      if (editionId) {
        await prisma.evaluation.deleteMany({ where: { editionId } });
        await prisma.team.deleteMany({ where: { editionId } });
        await prisma.nRC.deleteMany({ where: { id: { in: nrcIds } } });
        await prisma.weighting.deleteMany({ where: { editionId } });
        await prisma.edition.delete({ where: { id: editionId } });
      }
      if (subjectId) await prisma.subject.delete({ where: { id: subjectId } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    });

    const rowOf = async (key: string) => {
      const ranking = await service.getRanking({ editionId });
      const team = ranking.levels
        .flatMap((level) => level.teams)
        .find((t) => t.videogameId === videogameOf[key]);
      if (!team) throw new Error(`El equipo ${key} no salió en el ranking`);
      return team;
    };

    it.each([
      ['A', 3, 1],
      ['B', 2, 1],
      ['C', 1, 2],
    ])(
      'el equipo %s (%i junior · %i senior) suma 3 y no sale marcado «menos de 3»',
      async (key, junior, senior) => {
        const team = await rowOf(key);
        expect(team.juniorEvaluations).toBe(junior);
        expect(team.seniorEvaluations).toBe(senior);
        expect(team.lessThanMinEvaluations).toBe(false);
      },
    );

    it.each([['D', 1, 1]])(
      'el equipo %s (%i junior · %i senior) suma menos de 3 y sí se marca',
      async (key, junior, senior) => {
        const team = await rowOf(key);
        expect(team.juniorEvaluations).toBe(junior);
        expect(team.seniorEvaluations).toBe(senior);
        expect(team.lessThanMinEvaluations).toBe(true);
      },
    );

    it('no cambia la nota: «1 junior · 2 senior» sigue valiendo 40 % junior y 60 % senior', async () => {
      // 4 (junior) y 4 (senior): sin importar cuántas sean, el promedio de cada grupo es 4
      expect((await rowOf('C')).finalScore).toBe(4);
    });
  },
);
