import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TeamRepository } from '../teams/repositories/team.repository';
import { TeamsService } from '../teams/services/teams.service';
import { JurorService } from './juror.service';

/**
 * BG-39 (ARK-188) contra Postgres real: la lista del diálogo «Asignar equipo» (`GET
 * /teams/incomplete-jurors`) con dos ediciones cargadas y juegos pendiente, confirmado y rechazado.
 * Solo trae los confirmados de la edición activa, cada uno con su nivel, ordenados por nivel y
 * nombre; los equipos del jurado (`GET /juror/:id/teams`) también traen el nivel.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Durante la
 * prueba la edición «actual» es la ACTIVE; al terminar restaura los estados y borra lo que creó.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe(
  'Asignación manual: edición activa, confirmados y nivel (BD real)',
  () => {
    const prisma = new PrismaService();
    const repository = new TeamRepository(prisma, {} as any);
    const teams = new TeamsService(
      {} as any,
      repository,
      {} as any,
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );
    const jurors = new JurorService({} as any, prisma, {} as any);

    const tag = randomUUID().slice(0, 5);
    const ids = {
      previous: 0,
      current: 0,
      wasActive: [] as number[],
      users: [] as string[],
      teams: [] as number[],
      juror: '',
    };

    const edition = (semester: number) =>
      prisma.edition.create({
        data: {
          year: 2098,
          semester,
          title: `BG-39 ${tag} ${semester}`,
          startsAt: new Date('2098-01-01T00:00:00Z'),
          endsAt: new Date('2098-01-02T00:00:00Z'),
          status: EditionStatus.INACTIVE,
        },
        select: { id: true },
      });

    const user = async (key: string, role: string) => {
      const roleRow = await prisma.role.findFirstOrThrow({
        where: { name: role },
      });
      const created = await prisma.user.create({
        data: {
          email: `${key.toLowerCase()}-${tag}@bg39.test`,
          firstName: key,
          lastName: `BG39 ${tag}`,
          roleId: roleRow.id,
        },
        select: { id: true },
      });
      ids.users.push(created.id);
      return created.id;
    };

    const status = (name: string) =>
      prisma.videogameStatus.findUniqueOrThrow({ where: { status: name } });

    const team = async (
      name: string,
      code: string,
      editionId: number,
      statusName: string,
      jurorIds: string[] = [],
    ) => {
      const leader = await user(`lider${name}`, 'Estudiante');
      const created = await prisma.team.create({
        data: {
          teamName: `${name} ${tag}`,
          teamCode: `${code}-${tag}`.slice(0, 12),
          userId: leader,
          editionId,
          assignedJurors: { connect: jurorIds.map((id) => ({ id })) },
          videogame: {
            create: {
              name: `Juego ${name} ${tag}`.slice(0, 30),
              videogameStatusId: (await status(statusName)).id,
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
      ids.juror = await user('jurado', 'Jurado');

      // Edición anterior: confirmado, no debe aparecer en la activa
      await team('Anterior', 'N1-A', ids.previous, 'CONFIRMADO');
      // Edición actual: tres confirmados de distintos niveles, uno pendiente y uno rechazado
      await team('Zeta', 'N2-Z', ids.current, 'CONFIRMADO', []);
      await team('Beta', 'N1-B', ids.current, 'CONFIRMADO', []);
      await team('Álamo', 'N1-C', ids.current, 'CONFIRMADO', []);
      await team('Colegio', 'N0-K', ids.current, 'CONFIRMADO', []);
      await team('Pendiente', 'N1-P', ids.current, 'PENDIENTE');
      await team('Rechazado', 'N1-R', ids.current, 'RECHAZADO');
      // El jurado ya tiene un equipo de nivel 2 y otro de nivel 1 en la actual
      await team('Asignado2', 'N2-J', ids.current, 'CONFIRMADO', [ids.juror]);
      await team('Asignado1', 'N1-J', ids.current, 'CONFIRMADO', [ids.juror]);

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
      await jurors.onModuleInit();
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
        await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
        await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
        await prisma.edition.deleteMany({
          where: { id: { in: [ids.previous, ids.current] } },
        });
      } finally {
        await prisma.$disconnect();
      }
    });

    const ours = <T extends { nombre: string }>(list: T[]) =>
      list.filter((t) => t.nombre.endsWith(tag));

    it('por defecto (edición activa): solo confirmados, con nivel, ordenados por nivel y nombre', async () => {
      const list = ours(await teams.getTeamsWithLessThanThreeJurors());

      expect(list.map((t) => [t.nombre, t.nivel, t.nivelEtiqueta])).toEqual([
        [`Colegio ${tag}`, 0, 'Colegios'],
        [`Álamo ${tag}`, 1, 'Nivel 1'],
        [`Asignado1 ${tag}`, 1, 'Nivel 1'],
        [`Beta ${tag}`, 1, 'Nivel 1'],
        [`Asignado2 ${tag}`, 2, 'Nivel 2'],
        [`Zeta ${tag}`, 2, 'Nivel 2'],
      ]);
      expect(list[0].teamCode).toBe(`N0-K-${tag}`.slice(0, 12));
      const names = list.map((t) => t.nombre);
      expect(names).not.toContain(`Pendiente ${tag}`);
      expect(names).not.toContain(`Rechazado ${tag}`);
      expect(names).not.toContain(`Anterior ${tag}`);
    });

    it('la edición anterior se sigue consultando con editionId, sin mezclarse', async () => {
      const list = ours(
        await teams.getTeamsWithLessThanThreeJurors(ids.previous),
      );
      expect(list.map((t) => [t.nombre, t.nivelEtiqueta])).toEqual([
        [`Anterior ${tag}`, 'Nivel 1'],
      ]);
    });

    it('los equipos del jurado traen su nivel, para indicar qué niveles ya tiene', async () => {
      const assigned = await jurors.getTeamsAssignedToJuror(ids.juror);
      expect(
        assigned.map((t: any) => [
          t.nombre,
          t.nivel,
          t.nivelEtiqueta,
          t.teamCode,
        ]),
      ).toEqual([
        [`Asignado1 ${tag}`, 1, 'Nivel 1', `N1-J-${tag}`.slice(0, 12)],
        [`Asignado2 ${tag}`, 2, 'Nivel 2', `N2-J-${tag}`.slice(0, 12)],
      ]);
    });
  },
);
