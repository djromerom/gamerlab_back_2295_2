import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ROLE_IDS } from '../auth/constants/roles';
import { PrismaService } from '../prisma/prisma.service';
import { GradingGamesService } from './grading-games.service';
import { ProfessorPanelQueryService } from './professor-panel-query.service';
import { ProfessorsService } from './professors.service';

/**
 * Integración (BG-63, ARK-263) contra Postgres real: en «Históricos» el profesor solo ve los
 * equipos archivados de sus NRC (no los de otro profesor ni los «No registrado»), con el total
 * real; el Administrador los ve todos. Las opciones de NRC históricos siguen la misma regla.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Históricos del profesor solo con sus NRC (BD real)', () => {
  const prisma = new PrismaService();
  const professors = new ProfessorsService({} as any, prisma, {} as any);
  const panel = new GradingGamesService(
    prisma,
    new ProfessorPanelQueryService(prisma),
  );

  const tag = randomUUID().slice(0, 6);
  const ids = {
    edition: 0,
    users: [] as string[],
    subject: 0,
    nrcs: {} as Record<'mine' | 'other', number>,
    teams: [] as number[],
  };

  const user = async (key: string) => {
    const role = await prisma.role.findFirstOrThrow({
      where: { name: 'Profesor' },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@bg63.test`,
        firstName: key,
        lastName: `BG63 ${tag}`,
        roleId: role.id,
        isActive: true,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    return created.id;
  };

  const nrc = async (professorId: string, code: number) =>
    (
      await prisma.nRC.create({
        data: {
          code,
          subjectId: ids.subject,
          professorId,
          editionId: ids.edition,
        },
        select: { id: true },
      })
    ).id;

  const historical = async (
    code: string,
    nrcs: { nrcId: number; code: number }[],
  ) => {
    const created = await prisma.historicalTeam.create({
      data: {
        teamName: `${code} ${tag}`,
        teamCode: `${code}-${tag}`,
        editionId: ids.edition,
        videogame: { create: { name: `${code} ${tag}`, finalScore: 4 } },
        members: {
          create: {
            firstName: code,
            lastName: 'BG63',
            email: `${code}-${tag}@miembro.test`,
            studentCode: `${code}-${tag}`,
            nrcs: { create: nrcs },
          },
        },
      },
      select: { id: true },
    });
    ids.teams.push(created.id);
  };

  let mine = '';
  let other = '';

  const historicalCodes = async (professorId: string, roleId?: number) => {
    const { data, metadata } = await panel.list(
      professorId,
      {
        page: 1,
        limit: 50,
        editionId: ids.edition,
        includeHistorical: true,
        sortBy: 'team',
        sortOrder: 'asc',
      } as any,
      roleId,
    );
    return {
      codes: data.map((r) => r.teamCode.replace(`-${tag}`, '')).sort(),
      totalItems: metadata.totalItems,
    };
  };

  beforeAll(async () => {
    await prisma.$connect();
    ids.edition = (
      await prisma.edition.create({
        data: {
          year: 2096,
          semester: 30,
          title: `BG-63 ${tag}`,
          startsAt: new Date('2096-01-01T00:00:00Z'),
          endsAt: new Date('2096-01-02T00:00:00Z'),
          status: EditionStatus.ARCHIVED,
        },
        select: { id: true },
      })
    ).id;
    mine = await user('profe');
    other = await user('otro');
    ids.subject = (
      await prisma.subject.create({
        data: { name: `BG63 ${tag}`, code: `BG63${tag}`, semester: 1 },
        select: { id: true },
      })
    ).id;
    const base = 96000 + Math.floor(Math.random() * 900);
    ids.nrcs = {
      mine: await nrc(mine, base),
      other: await nrc(other, base + 1),
    };

    await historical('HMIO', [{ nrcId: ids.nrcs.mine, code: base }]);
    await historical('HOTR', [{ nrcId: ids.nrcs.other, code: base + 1 }]);
    await historical('HSIN', []);
  });

  afterAll(async () => {
    // Limpieza de los datos de esta prueba: la base es compartida con otras integraciones.
    try {
      await prisma.historicalTeam.deleteMany({
        where: { id: { in: ids.teams } },
      });
      await prisma.nRC.deleteMany({
        where: { id: { in: Object.values(ids.nrcs) } },
      });
      await prisma.subject.deleteMany({ where: { id: ids.subject } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({ where: { id: ids.edition } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('el profesor solo ve los históricos de sus NRC, con el total real', async () => {
    await expect(historicalCodes(mine)).resolves.toEqual({
      codes: ['HMIO'],
      totalItems: 1,
    });
    await expect(historicalCodes(other)).resolves.toEqual({
      codes: ['HOTR'],
      totalItems: 1,
    });
  });

  it('el Administrador ve todos los históricos de la feria', async () => {
    const admin = ids.users[0];
    await expect(historicalCodes(admin, ROLE_IDS.ADMIN)).resolves.toEqual({
      codes: ['HMIO', 'HOTR', 'HSIN'],
      totalItems: 3,
    });
  });

  it('las opciones de NRC históricos son solo las del profesor', async () => {
    const { nrcs } = await professors.getGradingFilterOptions(mine, {
      includeHistorical: true,
    });
    const historicalIds = nrcs
      .filter((n) => n.source === 'historical' && n.editionId === ids.edition)
      .map((n) => n.id);
    expect(historicalIds).toEqual([ids.nrcs.mine]);
  });
});
