import { EditionStatus, JurorEditionStatus, JurorType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JurorService } from './juror.service';
import { JurorAssignmentService } from './assignment-audit/juror-assignment.service';

/**
 * Integración (ARK-140 / BG-25) contra Postgres real: la pantalla de asignación de jurados toma su
 * lista de `jurorsOfEdition` (HU-25) y cada equipo trae su líder.
 *
 * - `GET /juror?participating=true`: jurados Confirmados y profesores con NRC activo en la edición;
 *   sin Pendientes, Declinados, profesores con NRC solo en otra edición ni cuentas inactivas. El tipo
 *   (Oficial/Suplente) es el de la edición.
 * - `GET /juror/evaluators`: misma lista; incluye a los profesores con equipos.
 * - `GET /juror/evaluation-tracking`: cada equipo trae `lider`.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Lista de jurados de la asignación por edición (BD real)', () => {
  const prisma = new PrismaService();
  const jurors = new JurorService({} as any, prisma, {} as any);
  const assignments = new JurorAssignmentService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    // HU-22 (ARK-84): avisos a suplentes (no aplican en estas pruebas).
    { recordAssignment: async () => null, sendEmailAfterCommit: () => undefined } as any,
  );

  const tag = randomUUID().slice(0, 6);
  const ids = {
    previous: 0,
    current: 0,
    wasActive: [] as number[],
    subject: 0,
    users: [] as string[],
    u: {} as Record<string, string>,
    leader: '',
    team: 0,
  };

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2099,
        semester,
        title: `BG-25 ${tag} ${semester}`,
        startsAt: new Date('2099-01-01T00:00:00Z'),
        endsAt: new Date('2099-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  const user = async (key: string, role: string, isActive = true) => {
    const roleRow = await prisma.role.findFirstOrThrow({ where: { name: role } });
    const created = await prisma.user.create({
      data: {
        email: `${key.toLowerCase()}-${tag}@bg25.test`,
        firstName: key,
        // «AAA»: queda primero en el listado paginado (orden por apellido)
        lastName: `AAA ${tag}`,
        roleId: roleRow.id,
        isActive,
        jurorType: JurorType.OFFICIAL,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    ids.u[key] = created.id;
    return created.id;
  };

  const inEdition = (
    key: string,
    editionId: number,
    status: JurorEditionStatus,
    type: JurorType = JurorType.OFFICIAL,
  ) =>
    prisma.jurorEdition.create({
      data: { jurorId: ids.u[key], editionId, status, type },
    });

  const nrc = (key: string, editionId: number, code: number) =>
    prisma.nRC.create({
      data: {
        code,
        subjectId: ids.subject,
        professorId: ids.u[key],
        editionId,
        isActive: true,
      },
    });

  beforeAll(async () => {
    await prisma.$connect();
    ids.previous = (await edition(11)).id;
    ids.current = (await edition(31)).id;
    ids.subject = (
      await prisma.subject.create({
        data: { name: `Materia ${tag}`, code: `B${tag}`, semester: 1 },
        select: { id: true },
      })
    ).id;

    await user('confirmado', 'Jurado');
    await user('suplente', 'Jurado');
    await user('pendiente', 'Jurado');
    await user('declino', 'Jurado');
    await user('soloanterior', 'Jurado');
    await user('inactivo', 'Jurado', false);
    await user('profnrc', 'Profesor');
    await user('profanterior', 'Profesor');

    await inEdition('confirmado', ids.current, JurorEditionStatus.CONFIRMED);
    await inEdition(
      'suplente',
      ids.current,
      JurorEditionStatus.CONFIRMED,
      JurorType.BACKUP,
    );
    await inEdition('pendiente', ids.current, JurorEditionStatus.PENDING);
    await inEdition('declino', ids.current, JurorEditionStatus.DECLINED);
    await inEdition('soloanterior', ids.previous, JurorEditionStatus.CONFIRMED);
    await inEdition('inactivo', ids.current, JurorEditionStatus.CONFIRMED);
    const code = 900000 + Math.floor(Math.random() * 90000);
    await nrc('profnrc', ids.current, code);
    await nrc('profanterior', ids.previous, code + 1);

    const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    ids.leader = await user('lider', 'Estudiante');
    const team = await prisma.team.create({
      data: {
        teamName: `Equipo BG25 ${tag}`,
        teamCode: `N0-${tag}`,
        userId: ids.leader,
        editionId: ids.current,
        // El profesor es el único evaluador del equipo: antes no contaba en la carga
        assignedJurors: { connect: [{ id: ids.u.profnrc }] },
        videogame: {
          create: { name: `Juego BG25 ${tag}`, videogameStatusId: confirmed.id },
        },
      },
      select: { id: true },
    });
    ids.team = team.id;

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
    await assignments.onModuleInit();
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
      await prisma.videogame.deleteMany({ where: { teamId: ids.team } });
      await prisma.team.deleteMany({ where: { id: ids.team } });
      await prisma.nRC.deleteMany({ where: { subjectId: ids.subject } });
      await prisma.subject.deleteMany({ where: { id: ids.subject } });
      await prisma.jurorEdition.deleteMany({
        where: { jurorId: { in: ids.users } },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({
        where: { id: { in: [ids.previous, ids.current] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  const ours = <T extends { id: string }>(rows: T[]) =>
    rows.filter((r) => ids.users.includes(r.id));
  const keyOf = (id: string) =>
    Object.keys(ids.u).find((k) => ids.u[k] === id);

  it('participating=true: solo Confirmados y profesores con NRC activo en la edición', async () => {
    const page = await jurors.findAll(false, 100, 1, undefined, true);
    expect(ours(page.data).map((j) => keyOf(j.id)).sort()).toEqual(
      ['confirmado', 'profnrc', 'suplente'].sort(),
    );
  });

  it('participating=true: el tipo es el de la edición y la carga cuenta al profesor', async () => {
    const page = await jurors.findAll(false, 100, 1, undefined, true);
    const byKey = Object.fromEntries(
      ours(page.data).map((j) => [keyOf(j.id), j]),
    );
    expect(byKey.suplente.jurorType).toBe(JurorType.BACKUP);
    expect(byKey.confirmado.jurorType).toBe(JurorType.OFFICIAL);
    expect(byKey.profnrc.unevaluatedGameNames).toEqual([`Juego BG25 ${tag}`]);
  });

  it('sin participating siguen todas las cuentas activas (Personal → Jurados)', async () => {
    const page = await jurors.findAll(false, 100, 1);
    const keys = ours(page.data).map((j) => keyOf(j.id));
    expect(keys).toEqual(
      expect.arrayContaining([
        'pendiente',
        'declino',
        'soloanterior',
        'profanterior',
      ]),
    );
    expect(keys).not.toContain('inactivo');
  });

  it('participating=true con una edición anterior usa la lista de esa edición', async () => {
    const page = await jurors.findAll(false, 100, 1, ids.previous, true);
    expect(ours(page.data).map((j) => keyOf(j.id)).sort()).toEqual(
      ['profanterior', 'soloanterior'].sort(),
    );
  });

  it('evaluadores con equipos: incluye al profesor de la edición', async () => {
    const evaluators = await jurors.getEvaluatorsWithTeams();
    const prof = evaluators.find((e) => e.id === ids.u.profnrc);
    expect(prof).toMatchObject({ tipo: 'Profesor', cantidadEquipos: 1 });
  });

  it('seguimiento: el equipo trae su líder', async () => {
    const tracking = await assignments.getEvaluationTracking(ids.team);
    expect(tracking[0].lider).toEqual({
      id: ids.leader,
      nombre: `lider AAA ${tag}`,
      email: `lider-${tag}@bg25.test`,
    });
  });
});
