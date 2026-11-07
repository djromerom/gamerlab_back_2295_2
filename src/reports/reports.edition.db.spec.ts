import { EditionStatus, JurorEditionStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';
import { EmailService } from '../email/email.service';
import { ROLE_IDS } from '../auth/constants/roles';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

/**
 * Integración (ARK-135 / BG-22) contra Postgres real: con dos ediciones, los reportes de
 * Estadísticas (jurados, juegos, NRC, materias, Excel) y los certificados de jurado cuentan solo
 * la edición activa por defecto, y la anterior se consulta con `editionId`.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Crea dos
 * ediciones de 2098; durante la prueba la «actual» es la ACTIVE y las activas del seed pasan a
 * INACTIVE. Al terminar restaura los estados y borra lo que creó.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Reportes y certificados de jurados por edición (BD real)', () => {
  const prisma = new PrismaService();
  const settings = { isRankingVisible: () => Promise.resolve(true) };
  const reports = new ReportsService(prisma, settings as any, blobRefsPassthrough() as any);
  const admin = { id: 'admin', roleId: ROLE_IDS.ADMIN } as any;

  const tag = randomUUID().slice(0, 6);
  const ids = {
    previous: 0,
    current: 0,
    wasActive: [] as number[],
    users: [] as string[],
    teams: [] as number[],
    nrcs: [] as number[],
    subject: 0,
    juror: '',
    jurorOld: '',
    professor: '',
    games: {} as Record<string, number>,
    nrcCode: {} as Record<string, number>,
  };

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2098,
        semester,
        title: `BG-22 ${tag} ${semester}`,
        startsAt: new Date('2098-01-01T00:00:00Z'),
        endsAt: new Date('2098-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({ where: { name: role } });
    const created = await prisma.user.create({
      data: {
        email: `${key.toLowerCase()}-${tag}@bg22.test`,
        firstName: key,
        lastName: `ZZ ${tag}`,
        roleId: roleRow.id,
        isActive: true,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    return created.id;
  };

  /** Equipo con un integrante en un NRC propio de la edición, asignado al jurado. */
  const team = async (key: string, editionId: number, nrcCode: number) => {
    const nrc = await prisma.nRC.create({
      data: { code: nrcCode, subjectId: ids.subject, professorId: ids.professor, editionId },
      select: { id: true },
    });
    ids.nrcs.push(nrc.id);
    ids.nrcCode[key] = nrcCode;
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
        assignedJurors: { connect: [{ id: ids.juror }] },
        videogame: {
          create: { name: `Juego ${key} ${tag}`, videogameStatusId: confirmed.id },
        },
        members: {
          create: {
            firstName: 'Ana',
            lastName: key,
            email: `int${key.toLowerCase()}-${tag}@bg22.test`,
            studentCode: `22${tag}${key}`,
            editionId,
            nrcs: { connect: [{ id: nrc.id }] },
          },
        },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    ids.teams.push(created.id);
    ids.games[key] = created.videogame!.id;
  };

  /** Evaluación con un solo criterio, cuyo puntaje es la nota total. */
  const evaluate = async (key: string, editionId: number, totalScore: number) => {
    const criterion = await prisma.criterion.findFirstOrThrow({ select: { id: true } });
    await prisma.evaluation.create({
      data: {
        jurorId: ids.juror,
        videogameId: ids.games[key],
        editionId,
        totalScore,
        details: { create: { score: totalScore, criterionId: criterion.id } },
      },
    });
  };

  beforeAll(async () => {
    await prisma.$connect();
    ids.previous = (await edition(10)).id;
    ids.current = (await edition(30)).id;
    ids.juror = await user('jurado', 'Jurado');
    ids.jurorOld = await user('jurado-viejo', 'Jurado');
    ids.professor = await user('profesor', 'Profesor');
    ids.subject = (
      await prisma.subject.create({
        data: { name: `Materia ${tag}`, code: `BG22${tag}`, semester: 1 },
        select: { id: true },
      })
    ).id;

    const base = 900000 + Math.floor(Math.random() * 90000);
    // Edición anterior: el juego P, calificado con 2
    await team('P', ids.previous, base);
    await evaluate('P', ids.previous, 2);
    // Edición actual: C calificado con 5 y D pendiente
    await team('C', ids.current, base + 1);
    await team('D', ids.current, base + 2);
    await evaluate('C', ids.current, 5);
    // HU-34: con la nota del profesor (sin detalles), C ya tiene nota final
    await prisma.evaluation.create({
      data: {
        jurorId: ids.professor,
        videogameId: ids.games.C,
        editionId: ids.current,
        totalScore: 5,
        isSenior: true,
      },
    });

    // Jurados de cada edición (HU-25): el jurado está confirmado en la actual; el viejo, solo en la anterior
    await prisma.jurorEdition.createMany({
      data: [
        { jurorId: ids.juror, editionId: ids.current, status: JurorEditionStatus.CONFIRMED },
        { jurorId: ids.jurorOld, editionId: ids.previous, status: JurorEditionStatus.CONFIRMED },
      ],
    });

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
      await prisma.jurorEdition.deleteMany({ where: { jurorId: { in: ids.users } } });
      await prisma.evaluation.deleteMany({
        where: { videogameId: { in: Object.values(ids.games) } },
      });
      await prisma.member.deleteMany({ where: { teamId: { in: ids.teams } } });
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

  const ours = (names: string[]) => names.filter((n) => n.endsWith(tag)).sort();

  it('reporte de jurados: asignados y evaluados solo de la edición pedida', async () => {
    const byDefault = await reports.getJuradosData();
    const mine = byDefault.find((j) => j.id === ids.juror)!;
    expect(ours(mine.videojuegosAsignados)).toEqual([`Juego C ${tag}`, `Juego D ${tag}`]);
    expect(mine.videojuegosCompletos).toEqual([`Juego C ${tag}`]);

    const previous = await reports.getJuradosData(ids.previous);
    const minePrev = previous.find((j) => j.id === ids.juror)!;
    expect(minePrev.videojuegosAsignados).toEqual([`Juego P ${tag}`]);
    expect(minePrev.videojuegosCompletos).toEqual([`Juego P ${tag}`]);
  });

  it('juegos de Estadísticas y Excel: solo la edición pedida', async () => {
    const games = await reports.getVideogamesData(admin);
    // HU-34: D no tiene notas: en la edición vigente, null (no 0)
    expect(games.find((g) => g.nombre === `Juego D ${tag}`)?.promedio).toBeNull();
    expect(ours(games.map((g) => g.nombre))).toEqual([`Juego C ${tag}`, `Juego D ${tag}`]);
    const previous = await reports.getVideogamesData(admin, ids.previous);
    expect(ours(previous.map((g) => g.nombre))).toEqual([`Juego P ${tag}`]);

    const excel = await reports.getVideogamesDataFilter(`Materia ${tag}`);
    expect(ours(excel.map((g) => g.nombre))).toEqual([`Juego C ${tag}`, `Juego D ${tag}`]);
    const excelPrev = await reports.getVideogamesDataFilter(`Materia ${tag}`, undefined, ids.previous);
    expect(ours(excelPrev.map((g) => g.nombre))).toEqual([`Juego P ${tag}`]);
  });

  it('promedio por NRC: solo los NRC y las notas de la edición pedida', async () => {
    const rows = await reports.getNrcWithSubjectNameAndAverage(admin);
    const mine = rows.filter((r) => r.materiaNombre === `Materia ${tag}`);
    expect(mine.map((r) => r.codigo).sort()).toEqual([ids.nrcCode.C, ids.nrcCode.D].sort());
    expect(mine.find((r) => r.codigo === ids.nrcCode.C)!.promedioxNRC).toBe(5);

    const prev = await reports.getNrcWithSubjectNameAndAverage(admin, ids.previous);
    const minePrev = prev.filter((r) => r.materiaNombre === `Materia ${tag}`);
    expect(minePrev.map((r) => r.codigo)).toEqual([ids.nrcCode.P]);
  });

  it('promedio por materia: no suma las notas de la otra edición', async () => {
    // Mezclando saldría (5 + 2) / 2 = 3.5
    const rows = await reports.getSubjectAverageScores(admin);
    expect(rows.find((r) => r.name === `Materia ${tag}`)?.value).toBe(5);
    const prev = await reports.getSubjectAverageScores(admin, ids.previous);
    expect(prev.find((r) => r.name === `Materia ${tag}`)?.value).toBe(2);
  });

  it('una edición que no existe responde 404, no 500', async () => {
    await expect(reports.getJuradosData(999999)).rejects.toBeInstanceOf(NotFoundException);
    await expect(reports.getVideogamesData(admin, 999999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('certificados: solo a los jurados confirmados en la edición activa', async () => {
    const certificates = {
      generateJurorCertificateHtml: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const env: Record<string, string> = {
      EVENT_DATE_TEXT: '26 de noviembre',
      EVENT_TIME_TEXT: '8:00 am',
      EVENT_PLACE_TEXT: 'Coliseo',
    };
    const config = { get: (key: string, def?: unknown) => env[key] ?? def };
    const email = new EmailService(prisma, certificates as any, config as any);
    const send = jest.spyOn(email, 'sendEmail').mockResolvedValue(undefined);

    const result = await email.sendAllJurorCertificates();
    const recipients = send.mock.calls.map((c) => c[0]);
    expect(recipients).toContain(`jurado-${tag}@bg22.test`);
    expect(recipients).not.toContain(`jurado-viejo-${tag}@bg22.test`);
    expect(result.sent).toBe(recipients.length);

    send.mockClear();
    await expect(email.resendJurorCertEmail(ids.jurorOld)).rejects.toThrow(/no participa/);
    expect(send).not.toHaveBeenCalled();
  });
});
