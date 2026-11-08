import { EditionStatus, JurorEditionStatus, JurorType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

/**
 * Integración (BG-40 / ARK-163) contra Postgres real: el Excel de asignación de jurados
 * (`GET /reports/exportJurados`) solo trae a los jurados de la edición según `jurorsOfEdition`
 * (HU-25): confirmados en «Jurados de la edición» y profesores con NRC activo en ella.
 * Se prueba con dos ediciones.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Crea dos
 * ediciones de 2097; durante la prueba la «actual» es la ACTIVE y las activas del seed pasan a
 * INACTIVE. Al terminar restaura los estados y borra lo que creó.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe(
  'Excel de asignación: solo jurados de la edición (BD real, BG-40)',
  () => {
    const prisma = new PrismaService();
    const reports = new ReportsService(
      prisma,
      {} as any,
      blobRefsPassthrough() as any,
    );

    const tag = randomUUID().slice(0, 6);
    const ids = {
      previous: 0,
      current: 0,
      wasActive: [] as number[],
      users: [] as string[],
      teams: [] as number[],
      nrcs: [] as number[],
      subject: 0,
    };
    const u: Record<string, string> = {};

    const edition = (semester: number) =>
      prisma.edition.create({
        data: {
          year: 2097,
          semester,
          title: `BG-40 ${tag} ${semester}`,
          startsAt: new Date('2097-01-01T00:00:00Z'),
          endsAt: new Date('2097-01-02T00:00:00Z'),
          status: EditionStatus.INACTIVE,
        },
        select: { id: true },
      });

    const emailOf = (key: string) => `${key}-${tag}@bg40.test`;

    const user = async (key: string, role: string, jurorType?: JurorType) => {
      const roleRow = await prisma.role.findFirstOrThrow({
        where: { name: role },
      });
      const created = await prisma.user.create({
        data: {
          email: emailOf(key),
          firstName: key,
          lastName: `ZZ ${tag}`,
          roleId: roleRow.id,
          isActive: true,
          ...(jurorType ? { jurorType } : {}),
        },
        select: { id: true },
      });
      ids.users.push(created.id);
      u[key] = created.id;
      return created.id;
    };

    /** Equipo con un integrante en un NRC del profesor, asignado a los jurados indicados. */
    const team = async (
      key: string,
      editionId: number,
      nrcCode: number,
      professorId: string,
      jurors: string[],
    ) => {
      const nrc = await prisma.nRC.create({
        data: { code: nrcCode, subjectId: ids.subject, professorId, editionId },
        select: { id: true },
      });
      ids.nrcs.push(nrc.id);
      const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
        where: { status: 'CONFIRMADO' },
      });
      const leader = await user(`lider${key}`, 'Estudiante');
      const created = await prisma.team.create({
        data: {
          teamName: `Equipo ${key} ${tag}`,
          teamCode: `N1-${key}${tag}`.slice(0, 12),
          userId: leader,
          editionId,
          assignedJurors: { connect: jurors.map((id) => ({ id })) },
          videogame: {
            create: {
              name: `Juego ${key} ${tag}`,
              videogameStatusId: confirmed.id,
            },
          },
          members: {
            create: {
              firstName: 'Ana',
              lastName: key,
              email: `int${key.toLowerCase()}-${tag}@bg40.test`,
              studentCode: `40${tag}${key}`,
              editionId,
              nrcs: { connect: [{ id: nrc.id }] },
            },
          },
        },
        select: { id: true },
      });
      ids.teams.push(created.id);
    };

    beforeAll(async () => {
      await prisma.$connect();
      ids.previous = (await edition(10)).id;
      ids.current = (await edition(30)).id;
      ids.subject = (
        await prisma.subject.create({
          data: { name: `Materia ${tag}`, code: `BG40${tag}`, semester: 1 },
          select: { id: true },
        })
      ).id;

      // La cuenta dice Oficial; en la edición actual es Suplente
      await user('confirmado', 'Jurado', JurorType.OFFICIAL);
      await user('pendiente', 'Jurado');
      await user('declino', 'Jurado');
      await user('viejo', 'Jurado');
      await user('profesor', 'Profesor', JurorType.OFFICIAL);
      await user('profesor-viejo', 'Profesor', JurorType.OFFICIAL);

      await prisma.jurorEdition.createMany({
        data: [
          {
            jurorId: u.confirmado,
            editionId: ids.current,
            status: JurorEditionStatus.CONFIRMED,
            type: JurorType.BACKUP,
          },
          {
            jurorId: u.pendiente,
            editionId: ids.current,
            status: JurorEditionStatus.PENDING,
          },
          {
            jurorId: u.declino,
            editionId: ids.current,
            status: JurorEditionStatus.DECLINED,
          },
          {
            jurorId: u.viejo,
            editionId: ids.previous,
            status: JurorEditionStatus.CONFIRMED,
          },
        ],
      });

      const base = 800000 + Math.floor(Math.random() * 90000);
      // Edición actual: el pendiente tiene un grupo (asignación vieja) pero no debe salir
      await team('C', ids.current, base, u.profesor, [
        u.confirmado,
        u.pendiente,
        u.profesor,
      ]);
      // Edición anterior: el profesor viejo solo tiene NRC aquí
      await team('P', ids.previous, base + 1, u['profesor-viejo'], [u.viejo]);

      const active = await prisma.edition.findMany({
        where: { status: EditionStatus.ACTIVE },
        select: { id: true },
      });
      ids.wasActive = active.map((e) => e.id);
      await prisma.edition.updateMany({
        where: { id: { in: ids.wasActive } },
        data: { status: EditionStatus.INACTIVE },
      });
      await prisma.edition.update({
        where: { id: ids.current },
        data: { status: EditionStatus.ACTIVE },
      });
    });

    afterAll(async () => {
      try {
        await prisma.edition.update({
          where: { id: ids.current },
          data: { status: EditionStatus.INACTIVE },
        });
        await prisma.edition.updateMany({
          where: { id: { in: ids.wasActive } },
          data: { status: EditionStatus.ACTIVE },
        });
        await prisma.jurorEdition.deleteMany({
          where: { jurorId: { in: ids.users } },
        });
        await prisma.member.deleteMany({
          where: { teamId: { in: ids.teams } },
        });
        await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
        await prisma.nRC.deleteMany({ where: { id: { in: ids.nrcs } } });
        await prisma.subject.deleteMany({ where: { id: ids.subject } });
        await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
        await prisma.edition.deleteMany({
          where: { id: { in: [ids.previous, ids.current] } },
        });
      } finally {
        await prisma.$disconnect();
      }
    });

    /** Filas creadas por esta prueba: [correo, estado, tipo]. */
    const ours = (rows: { correo: string; estado: string; tipo: string }[]) =>
      rows
        .filter((r) => r.correo.endsWith(`-${tag}@bg40.test`))
        .map((r) => [
          r.correo.replace(`-${tag}@bg40.test`, ''),
          r.estado,
          r.tipo,
        ])
        .sort((a, b) => a[0].localeCompare(b[0]));

    it('edición activa: confirmados y profesores con NRC; nadie Pendiente, que Declinó o de otra edición', async () => {
      const { edition, rows } = await reports.getJurorAssignmentReport();

      expect(edition.id).toBe(ids.current);
      expect(ours(rows)).toEqual([
        ['confirmado', 'Confirmado', 'Suplente'],
        ['profesor', 'Profesor con NRC', 'Oficial'],
      ]);
    });

    it('edición anterior (?editionId): solo sus jurados', async () => {
      const { edition, rows } = await reports.getJurorAssignmentReport(
        ids.previous,
      );

      expect(edition.id).toBe(ids.previous);
      expect(ours(rows)).toEqual([
        ['profesor-viejo', 'Profesor con NRC', 'Oficial'],
        ['viejo', 'Confirmado', 'Oficial'],
      ]);
    });
  },
);
