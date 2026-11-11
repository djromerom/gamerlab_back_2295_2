import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ROLE_IDS } from '../src/auth/constants/roles';
import { findActiveEdition } from '../src/editions/active-edition';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProfessorsService } from '../src/professors/professors.service';
import { StudentsService } from '../src/students/students.service';
import { TeamRepository } from '../src/teams/repositories/team.repository';

/**
 * HU-31 (ARK-167) contra PostgreSQL real: un NRC por materia, de la edición activa, y varias
 * materias por proyecto. El equipo inscrito aparece en el reporte de cada profesor.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed
 * (roles, edición activa). Crea sus materias, NRC, profesores y una edición inactiva, y borra
 * al final lo que creó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb('NRC por materia en la inscripción (PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = prisma as unknown as PrismaService;
  const auth = {
    // Como AuthService.registerUserTransaction, sin enviar correos
    registerUserTransaction: async (dto: { email: string }, tx: any) => ({
      user: await tx.user.create({
        data: {
          id: `it-hu31-${dto.email}`,
          email: dto.email,
          roleId: ROLE_IDS.STUDENT,
          firstName: '',
          lastName: '',
        },
      }),
      verificationToken: 'token',
    }),
    sendVerificationEmail: async () => undefined,
  };
  const teams = new TeamRepository(db, auth as any);
  const students = new StudentsService(db);
  const professors = new ProfessorsService({} as any, db, {} as any);
  const run = Date.now().toString(36).slice(-5);
  const base = 70000 + (Date.now() % 9000) * 3;
  const code = { poo1: base, poo2: base + 1, datos: base + 2, otra: base + 3 };
  const created = {
    subjects: [] as number[],
    users: [] as string[],
    teams: [] as number[],
  };
  let editionId: number;
  let otherEditionId: number;
  const nrcId: Record<string, number> = {};
  const profOf: Record<string, string> = {};

  const member = (i: number, nrc: Array<string | number>) => ({
    memberFirstName: 'IT',
    memberLastName: `HU31 ${i}`,
    memberEmail: `it-hu31-${run}-${i}@uninorte.edu.co`,
    studentCode: `8${run.replace(/\D/g, '')}${i}`.slice(0, 9).padEnd(9, '0'),
    nrc: nrc.map(String),
  });
  const register = (teamName: string, members: ReturnType<typeof member>[]) =>
    teams.createTeam({
      teamName,
      isExternal: false,
      members,
      videogame: { vgName: `Juego ${teamName}` },
    } as any);

  beforeAll(async () => {
    editionId = (await findActiveEdition(db))!.id;
    otherEditionId = (
      await prisma.edition.create({
        data: {
          year: 1900 + (Date.now() % 100),
          semester: 10,
          title: `IT HU31 ${run}`,
          startsAt: new Date('2020-01-01'),
          endsAt: new Date('2020-01-02'),
        },
      })
    ).id;
    for (const [key, name, abrev] of [
      ['poo', `POO ${run}`, 'POO'],
      ['datos', `Datos I ${run}`, 'EDI'],
    ]) {
      const s = await prisma.subject.create({
        data: { name, code: `IT${run}${key}`, semester: 3, abrevName: abrev },
      });
      created.subjects.push(s.id);
      const prof = await prisma.user.create({
        data: {
          id: `it-hu31-prof-${key}-${run}`,
          email: `it-hu31-prof-${key}-${run}@uninorte.edu.co`,
          roleId: ROLE_IDS.PROFESSOR,
          firstName: 'Prof',
          lastName: key,
        },
      });
      created.users.push(prof.id);
      profOf[key] = prof.id;
      const codes =
        key === 'poo'
          ? [
              ['poo1', editionId],
              ['poo2', editionId],
              ['otra', otherEditionId],
            ]
          : [['datos', editionId]];
      for (const [k, ed] of codes as [keyof typeof code, number][]) {
        const n = await prisma.nRC.create({
          data: {
            code: code[k],
            subjectId: s.id,
            professorId: prof.id,
            editionId: ed,
          },
        });
        nrcId[k] = n.id;
      }
    }
  });

  afterAll(async () => {
    const teamIds = await prisma.team.findMany({
      where: { teamName: { startsWith: `IT HU31 ${run}` } },
      select: { id: true, userId: true },
    });
    await prisma.member.deleteMany({
      where: { teamId: { in: teamIds.map((t) => t.id) } },
    });
    await prisma.videogame.deleteMany({
      where: { teamId: { in: teamIds.map((t) => t.id) } },
    });
    await prisma.team.deleteMany({
      where: { id: { in: teamIds.map((t) => t.id) } },
    });
    await prisma.nRC.deleteMany({
      where: { subjectId: { in: created.subjects } },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { in: created.users } },
          { email: { startsWith: `it-hu31-${run}` } },
        ],
      },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: created.subjects } },
    });
    await prisma.edition.deleteMany({ where: { id: otherEditionId } });
    await prisma.$disconnect();
  });

  it('equipo de 5: el líder con dos materias y los demás con una; aparece en el reporte de cada profesor', async () => {
    const name = `IT HU31 ${run} a`;
    const { members } = await register(name, [
      member(1, [code.poo1, code.datos]),
      member(2, [code.poo1]),
      member(3, [code.poo2]),
      member(4, [code.datos]),
      member(5, [code.poo1, code.datos]),
    ]);
    expect(members).toHaveLength(5);
    const leader = await prisma.member.findFirstOrThrow({
      where: { email: member(1, []).memberEmail },
      include: { nrcs: true },
    });
    expect(leader.nrcs.map((n) => n.code).sort()).toEqual(
      [code.poo1, code.datos].sort(),
    );

    for (const [nrc, prof] of [
      ['poo1', 'poo'],
      ['poo2', 'poo'],
      ['datos', 'datos'],
    ]) {
      const report = await professors.getNrcReportById(
        nrcId[nrc],
        editionId,
        false,
        50,
        1,
        profOf[prof],
      );
      expect(JSON.stringify(report)).toContain(name);
    }
  });

  it('dos NRC de la misma materia: 400 y no se crea el equipo', async () => {
    const name = `IT HU31 ${run} b`;
    await expect(
      register(name, [member(6, [code.poo1, code.poo2])]),
    ).rejects.toThrow(BadRequestException);
    expect(await prisma.team.count({ where: { teamName: name } })).toBe(0);
  });

  it('un NRC de otra edición: 400 y no se crea el equipo', async () => {
    const name = `IT HU31 ${run} c`;
    await expect(
      register(name, [member(7, [code.datos, code.otra])]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ field: 'nrc' }),
    });
    expect(await prisma.team.count({ where: { teamName: name } })).toBe(0);
  });

  it('el administrador cambia NRC con las mismas reglas', async () => {
    const m = await prisma.member.findFirstOrThrow({
      where: { email: member(2, []).memberEmail },
    });
    const admin = { id: 'admin-it', roleId: ROLE_IDS.ADMIN } as any;
    await expect(
      students.editNrc(admin, m.id, [code.poo1, code.poo2]),
    ).rejects.toThrow(/Elige un solo NRC por materia/);
    await students.editNrc(admin, m.id, [code.poo2, code.datos]);
    const after = await prisma.member.findUniqueOrThrow({
      where: { id: m.id },
      include: { nrcs: true },
    });
    expect(after.nrcs.map((n) => n.code).sort()).toEqual(
      [code.poo2, code.datos].sort(),
    );
  });
});
