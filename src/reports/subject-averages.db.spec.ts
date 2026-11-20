import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';
import { ROLE_IDS } from '../auth/constants/roles';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

/**
 * Integración (ARK-265 / BG-65) contra Postgres real: en «Promedios por Materia»
 * - una materia de colegios, cuyos juegos solo tienen la nota del profesor (el total, sin detalle por
 *   criterio), muestra el promedio real de sus juegos y no 0;
 * - una materia sin ninguna nota es null («Sin nota»), no 0.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Crea una edición
 * de 2097 (se consulta con `editionId`, sin tocar la activa) y borra al final lo que creó.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe(
  'Promedio por materia con notas del profesor y sin notas (BD real)',
  () => {
    const prisma = new PrismaService();
    const settings = { isRankingVisible: () => Promise.resolve(true) };
    const reports = new ReportsService(
      prisma,
      settings as never,
      blobRefsPassthrough() as never,
    );
    const admin = { id: 'admin', roleId: ROLE_IDS.ADMIN } as never;
    const tag = randomUUID().slice(0, 6);

    const created = {
      editionId: 0,
      users: [] as string[],
      subjects: [] as number[],
      nrcs: [] as number[],
      teams: [] as number[],
      games: [] as number[],
    };
    let professorId = '';
    let jurorId = '';
    let criterionId = 0;

    const user = async (key: string, role: string) => {
      const roleRow = await prisma.role.findFirstOrThrow({
        where: { name: role },
      });
      const row = await prisma.user.create({
        data: {
          email: `${key}-${tag}@bg65.test`,
          firstName: key,
          lastName: `BG65 ${tag}`,
          roleId: roleRow.id,
        },
        select: { id: true },
      });
      created.users.push(row.id);
      return row.id;
    };

    const subject = async (name: string) => {
      const row = await prisma.subject.create({
        data: {
          name: `${name} ${tag}`,
          code: `B65${tag}${created.subjects.length}`,
          semester: 1,
        },
        select: { id: true },
      });
      created.subjects.push(row.id);
      return row.id;
    };

    /** Un equipo confirmado con un integrante en un NRC de la materia; devuelve el id de su juego. */
    const game = async (key: string, subjectId: number, code: string) => {
      const nrc = await prisma.nRC.create({
        data: {
          code: 960000 + created.nrcs.length + Math.floor(Math.random() * 900),
          subjectId,
          professorId,
          editionId: created.editionId,
        },
        select: { id: true },
      });
      created.nrcs.push(nrc.id);
      const status = await prisma.videogameStatus.findUniqueOrThrow({
        where: { status: 'CONFIRMADO' },
      });
      const team = await prisma.team.create({
        data: {
          teamName: `Equipo ${key} ${tag}`,
          teamCode: code,
          userId: await user(`lider${key}`, 'Estudiante'),
          editionId: created.editionId,
          videogame: {
            create: {
              name: `Juego ${key} ${tag}`,
              videogameStatusId: status.id,
            },
          },
          members: {
            create: {
              firstName: 'Ana',
              lastName: key,
              email: `int${key}-${tag}@bg65.test`,
              studentCode: `65${tag}${key}`,
              editionId: created.editionId,
              nrcs: { connect: [{ id: nrc.id }] },
            },
          },
        },
        select: { id: true, videogame: { select: { id: true } } },
      });
      created.teams.push(team.id);
      created.games.push(team.videogame!.id);
      return team.videogame!.id;
    };

    /** Nota del profesor: solo el total, sin detalle por criterio (así se guarda la de los colegios). */
    const professorGrade = (videogameId: number, totalScore: number) =>
      prisma.evaluation.create({
        data: {
          jurorId: professorId,
          videogameId,
          editionId: created.editionId,
          totalScore,
          isSenior: true,
        },
      });

    beforeAll(async () => {
      await prisma.$connect();
      created.editionId = (
        await prisma.edition.create({
          data: {
            year: 2097,
            semester: 800 + Math.floor(Math.random() * 90),
            title: `BG-65 ${tag}`,
            startsAt: new Date('2097-01-01T00:00:00Z'),
            endsAt: new Date('2097-01-02T00:00:00Z'),
            status: EditionStatus.INACTIVE,
          },
          select: { id: true },
        })
      ).id;
      professorId = await user('profesor', 'Profesor');
      jurorId = await user('jurado', 'Jurado');
      criterionId = (
        await prisma.criterion.findFirstOrThrow({ select: { id: true } })
      ).id;

      // «Colegios»: dos juegos con solo la nota del profesor (3.8 y 3.6)
      const colegios = await subject('Colegios');
      await professorGrade(await game('A', colegios, `N0-A${tag}`), 3.8);
      await professorGrade(await game('B', colegios, `N0-B${tag}`), 3.6);

      // Mixta: un jurado con un criterio de 4 y la nota del profesor (5, sin detalle)
      const mixta = await subject('Mixta');
      const mixed = await game('C', mixta, `N1-C${tag}`);
      await prisma.evaluation.create({
        data: {
          jurorId,
          videogameId: mixed,
          editionId: created.editionId,
          totalScore: 4,
          details: { create: { score: 4, criterionId } },
        },
      });
      await professorGrade(mixed, 5);

      // Sin ninguna nota: un juego sin evaluaciones y una materia sin equipos
      await game('D', await subject('Sin notas'), `N1-D${tag}`);
      await subject('Sin equipos');
    });

    afterAll(async () => {
      try {
        await prisma.evaluation.deleteMany({
          where: { videogameId: { in: created.games } },
        });
        await prisma.member.deleteMany({
          where: { teamId: { in: created.teams } },
        });
        await prisma.team.deleteMany({ where: { id: { in: created.teams } } });
        await prisma.nRC.deleteMany({ where: { id: { in: created.nrcs } } });
        await prisma.subject.deleteMany({
          where: { id: { in: created.subjects } },
        });
        await prisma.user.deleteMany({ where: { id: { in: created.users } } });
        await prisma.edition.deleteMany({ where: { id: created.editionId } });
      } finally {
        await prisma.$disconnect();
      }
    });

    const valueOf = async (name: string) =>
      (await reports.getSubjectAverageScores(admin, created.editionId)).find(
        (row) => row.name === `${name} ${tag}`,
      )?.value;

    it('Colegios muestra el promedio real de sus juegos, no 0', async () => {
      expect(await valueOf('Colegios')).toBe(3.7);
    });

    it('una materia con evaluaciones con y sin detalle cuenta ambas', async () => {
      // (4 + 5) / 2
      expect(await valueOf('Mixta')).toBe(4.5);
    });

    it('una materia sin notas, con o sin equipos, es null y no 0', async () => {
      expect(await valueOf('Sin notas')).toBeNull();
      expect(await valueOf('Sin equipos')).toBeNull();
    });
  },
);
