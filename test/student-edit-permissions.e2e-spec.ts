import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ROLE_IDS } from '../src/auth/constants/roles';
import { ACTIVE_EDITION_CONFIG_WHERE } from '../src/settings/active-edition-config';
import { PrismaService } from '../src/prisma/prisma.service';
import { StudentsService } from '../src/students/students.service';
import { TeamRepository } from '../src/teams/repositories/team.repository';
import { TeamsService } from '../src/teams/services/teams.service';
import { blobRefsPassthrough } from '../src/upload/blob-reference.mock';

/**
 * ARK-161 (BG-38) contra PostgreSQL real: el líder de un equipo confirmado intenta cambiar su
 * NRC (por las dos rutas), marcar el equipo como externo y editar con las inscripciones
 * cerradas; editar el contenido no lo devuelve a PENDIENTE y cambiar el nombre sí.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed
 * (rol Estudiante, edición activa con su configuración). Deja `registrationsOpen` como estaba y
 * borra al final lo que creó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb('Qué puede editar el estudiante (PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = prisma as unknown as PrismaService;
  const teams = new TeamsService(
    {} as any,
    new TeamRepository(db, {} as any),
    {} as any,
    db,
    {} as any,
    blobRefsPassthrough(),
    {} as any,
  );
  const students = new StudentsService(db);
  const runId = Date.now().toString(36).slice(-5);
  const admin = { id: 'admin-it', roleId: ROLE_IDS.ADMIN } as any;
  let leader: any;
  let teamId: number;
  let memberId: number;
  let configId: number;
  let wasOpen: boolean;

  const status = async () =>
    (
      await prisma.videogame.findUniqueOrThrow({
        where: { teamId },
        select: { videogameStatusId: true },
      })
    ).videogameStatusId;
  const setOpen = (open: boolean) =>
    prisma.eventConfiguration.update({
      where: { id: configId },
      data: { registrationsOpen: open },
    });

  beforeAll(async () => {
    const config = await prisma.eventConfiguration.findFirstOrThrow({
      where: ACTIVE_EDITION_CONFIG_WHERE,
      select: { id: true, registrationsOpen: true, editionId: true },
    });
    configId = config.id;
    wasOpen = config.registrationsOpen;
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'Estudiante' },
    });
    const email = `it-bg38-${runId}@uninorte.edu.co`;
    const user = await prisma.user.create({
      data: {
        id: `it-bg38-${runId}`,
        email,
        roleId: role.id,
        firstName: 'IT',
        lastName: 'BG38',
      },
    });
    leader = { id: user.id, email, roleId: ROLE_IDS.STUDENT };
    const team = await prisma.team.create({
      data: {
        teamName: `IT BG38 ${runId}`,
        userId: user.id,
        editionId: config.editionId,
        teamCode: `B38${runId}`.slice(0, 12),
        members: {
          create: {
            firstName: 'IT',
            lastName: 'BG38',
            email,
            studentCode: `9${runId}`,
            editionId: config.editionId,
          },
        },
        videogame: { create: { name: `Juego ${runId}`, videogameStatusId: 1 } },
      },
      include: { members: true },
    });
    teamId = team.id;
    memberId = team.members[0].id;
  });

  afterAll(async () => {
    await setOpen(wasOpen);
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({ where: { id: leader?.id } });
    await prisma.$disconnect();
  });

  beforeEach(() => setOpen(true));

  it('el líder no puede cambiar su NRC por PATCH /students/members/:id/nrcs', async () => {
    await expect(students.editNrc(leader, memberId, [1])).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('el líder no puede cambiar su NRC ni marcar externo por PATCH /teams/:id', async () => {
    await expect(
      teams.update(
        teamId,
        { members: [{ id: memberId, nrc: ['1'] }] } as any,
        leader,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      teams.update(teamId, { isExternal: true } as any, leader),
    ).rejects.toThrow(ForbiddenException);
    const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.isExternal).toBe(false);
  });

  it('editar la descripción deja el juego CONFIRMADO; cambiar el nombre del equipo lo pasa a PENDIENTE', async () => {
    await teams.updateTeamInfo(
      teamId,
      { videogame: { description: 'Nueva' } } as any,
      leader,
    );
    expect(await status()).toBe(1);
    await teams.updateTeamInfo(
      teamId,
      { teamName: `IT BG38 ${runId} b` } as any,
      leader,
    );
    expect(await status()).toBe(2);
  });

  it('con las inscripciones cerradas el líder no edita y el administrador sí', async () => {
    await setOpen(false);
    await expect(
      teams.updateTeamInfo(
        teamId,
        { videogame: { description: 'Otra' } } as any,
        leader,
      ),
    ).rejects.toThrow(/Las inscripciones están cerradas/);
    await teams.updateTeamInfo(
      teamId,
      { videogame: { description: 'Admin' } } as any,
      admin,
    );
    const vg = await prisma.videogame.findUniqueOrThrow({ where: { teamId } });
    expect(vg.description).toBe('Admin');
  });
});
