import { ForbiddenException } from '@nestjs/common';
import { EditionStatus, PrismaClient } from '@prisma/client';
import { ROLE_IDS } from '../src/auth/constants/roles';
import { PrismaService } from '../src/prisma/prisma.service';
import { TeamRepository } from '../src/teams/repositories/team.repository';
import { TeamsService } from '../src/teams/services/teams.service';
import { blobRefsPassthrough } from '../src/upload/blob-reference.mock';

/**
 * ARK-112 contra PostgreSQL real: dos estudiantes de equipos distintos, un integrante que no
 * es líder, un integrante inactivo y un correo con `_` (comodín de ILIKE) que no debe pasar
 * por el de otra persona.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed
 * (necesita el rol Estudiante). Crea su propia edición (inactiva) y borra al final lo que generó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb('Lectura de un equipo por rol (PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const repository = new TeamRepository(
    prisma as unknown as PrismaService,
    {} as any,
  );
  const service = new TeamsService(
    {} as any,
    repository,
    {} as any,
    prisma as unknown as PrismaService,
    {} as any,
    blobRefsPassthrough(),
    {} as any, // RankingService (HU-04)
  );
  const runId = Date.now().toString(36).slice(-5);
  const userIds: string[] = [];
  let editionId: number;
  const teams: Record<'a' | 'b', { id: number; leaderId: string }> = {} as any;
  const mail = (s: string) => `it-ark112-${runId}-${s}@uninorte.edu.co`;

  async function student(suffix: string, email = mail(suffix)) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'Estudiante' },
    });
    const u = await prisma.user.create({
      data: {
        id: `it-ark112-${runId}-${suffix}`,
        email,
        roleId: role.id,
        firstName: 'IT',
        lastName: suffix,
      },
    });
    userIds.push(u.id);
    return { id: u.id, email: u.email, roleId: ROLE_IDS.STUDENT } as any;
  }

  beforeAll(async () => {
    const edition = await prisma.edition.create({
      data: {
        year: 2099,
        semester: 20 + (Date.now() % 7),
        title: `it-ark112-${runId}`,
        startsAt: new Date(Date.UTC(2099, 0, 1)),
        endsAt: new Date(Date.UTC(2099, 0, 31)),
        status: EditionStatus.INACTIVE,
      },
    });
    editionId = edition.id;

    for (const key of ['a', 'b'] as const) {
      const leader = await student(`lider-${key}`);
      const t = await prisma.team.create({
        data: {
          teamName: `it-ark112-${runId}-${key}`,
          userId: leader.id,
          editionId,
          teamCode: `N1-IT-${runId}${key}`.slice(0, 12),
          verificationCode: `V${runId}${key}`.slice(0, 8),
          videogame: { create: { name: `it-ark112-${runId}-${key}` } },
          members: {
            create: [
              {
                firstName: 'IT',
                lastName: `activo-${key}`,
                // Guardado con mayúsculas, como los registros antes de normalizar
                email: mail(`Mem_${key}`).toUpperCase(),
                studentCode: `it112${runId}${key}1`,
                editionId,
              },
              {
                firstName: 'IT',
                lastName: `inactivo-${key}`,
                email: mail(`baja-${key}`),
                studentCode: `it112${runId}${key}2`,
                editionId,
                isActive: false,
              },
            ],
          },
        },
      });
      teams[key] = { id: t.id, leaderId: leader.id };
    }
  });

  afterAll(async () => {
    if (editionId) {
      await prisma.team.deleteMany({ where: { editionId } });
      await prisma.edition.delete({ where: { id: editionId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('el líder de A lee su equipo y no el de B, por las dos rutas', async () => {
    const leaderA = {
      id: teams.a.leaderId,
      email: mail('lider-a'),
      roleId: ROLE_IDS.STUDENT,
    } as any;

    await expect(service.findOne(teams.a.id, leaderA)).resolves.toMatchObject({
      id: teams.a.id,
    });
    await expect(
      service.findOneWithDetails(String(teams.a.id), leaderA),
    ).resolves.toMatchObject({ id: teams.a.id });

    await expect(service.findOne(teams.b.id, leaderA)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.findOneWithDetails(String(teams.b.id), leaderA),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.findOneWithDetails(teams.b.leaderId, leaderA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('un integrante activo que no es líder lee su equipo (correo sin distinguir mayúsculas)', async () => {
    const member = await student('mem-a', mail('mem_a'));
    const team = (await service.findOne(teams.a.id, member)) as any;
    expect(team.verificationCode).toBe(`V${runId}a`.slice(0, 8));
    await expect(service.findOne(teams.b.id, member)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('un integrante dado de baja ya no lee el equipo', async () => {
    const former = await student('baja-a', mail('baja-a'));
    await expect(service.findOne(teams.a.id, former)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('el `_` del correo no actúa como comodín', async () => {
    // "memXa" encajaría con "mem_a" si el `_` no se escapara
    const impostor = await student('impostor', mail('memXa'));
    await expect(
      repository.isActiveMember(teams.a.id, mail('memXa')),
    ).resolves.toBe(false);
    await expect(service.findOne(teams.a.id, impostor)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('un profesor recibe el detalle sin correos, códigos ni código de verificación', async () => {
    const prof = {
      id: 'p',
      email: 'p@x.co',
      roleId: ROLE_IDS.PROFESSOR,
    } as any;
    const team = await service.findOneWithDetails(String(teams.a.id), prof);
    const text = JSON.stringify(team);
    expect(text).not.toMatch(
      /@uninorte\.edu\.co|studentCode|verificationCode/i,
    );
    expect((team as any).members).toHaveLength(1);
  });
});
