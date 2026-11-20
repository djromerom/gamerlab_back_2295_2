import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NrcsService } from './nrcs.service';

/**
 * Integración (ARK-136 / BG-23) contra Postgres real: con dos ediciones, la lista de NRC del
 * administrador muestra por defecto solo la edición activa, la anterior se consulta con
 * `editionId`, y el aviso de inscripciones cuenta solo los NRC activos de la edición activa.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Crea dos
 * ediciones de 2097; durante la prueba la «actual» es la ACTIVE y la(s) activa(s) del seed pasan a
 * INACTIVE. Al terminar restaura los estados y borra lo que creó.
 *
 * ARK-236 (BG-46): también comprueba que lista, detalle, crear y editar no devuelven el `password`
 * del profesor.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('NRC por edición (BD real)', () => {
  const prisma = new PrismaService();
  const service = new NrcsService(prisma);

  const tag = randomUUID().slice(0, 6);
  const ids = {
    previous: 0,
    current: 0,
    wasActive: [] as number[],
    professor: '',
    subject: 0,
    nrcs: [] as number[],
    currentActiveNrc: 0,
  };

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2097,
        semester,
        title: `BG-23 ${tag} ${semester}`,
        startsAt: new Date('2097-01-01T00:00:00Z'),
        endsAt: new Date('2097-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  const nrc = async (code: number, editionId: number, isActive = true) => {
    const created = await prisma.nRC.create({
      data: {
        code,
        subjectId: ids.subject,
        professorId: ids.professor,
        editionId,
        isActive,
      },
      select: { id: true },
    });
    ids.nrcs.push(created.id);
    return created.id;
  };

  beforeAll(async () => {
    await prisma.$connect();
    ids.previous = (await edition(10)).id;
    ids.current = (await edition(30)).id;

    const professorRole = await prisma.role.findFirstOrThrow({ where: { name: 'Profesor' } });
    ids.professor = (
      await prisma.user.create({
        data: {
          email: `profesor-${tag}@bg23.test`,
          firstName: 'Profesor',
          lastName: tag,
          // ARK-236 (BG-46): con contraseña, para comprobar que /nrcs no la devuelve
          password: '$2b$10$hashdeprueba.ark236',
          roleId: professorRole.id,
          isActive: true,
        },
        select: { id: true },
      })
    ).id;
    ids.subject = (
      await prisma.subject.create({
        data: { name: `Materia ${tag}`, code: `M${tag}`, semester: 1 },
        select: { id: true },
      })
    ).id;

    // Edición anterior: dos NRC activos (como los 36 de la edición 4 en producción)
    await nrc(970001, ids.previous);
    await nrc(970002, ids.previous);
    // Edición actual: uno activo y uno inactivo
    ids.currentActiveNrc = await nrc(970003, ids.current);
    await nrc(970004, ids.current, false);

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
      await prisma.nRC.deleteMany({ where: { id: { in: ids.nrcs } } });
      await prisma.subject.deleteMany({ where: { id: ids.subject } });
      await prisma.user.deleteMany({ where: { id: ids.professor } });
      await prisma.edition.deleteMany({
        where: { id: { in: [ids.previous, ids.current] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  const codes = (rows: { code: number }[]) => rows.map((r) => r.code).sort();

  it('por defecto lista solo los NRC activos de la edición activa', async () => {
    const result = await service.findAll(false, 100, 1);

    expect(result.edition).toMatchObject({ id: ids.current, readOnly: false });
    expect(codes(result.data)).toEqual([970003]);
    expect(result.metadata.totalItems).toBe(1);
  });

  it('con includeInactive incluye el inactivo, pero nunca los de otra edición', async () => {
    const result = await service.findAll(true, 100, 1);

    expect(codes(result.data)).toEqual([970003, 970004]);
  });

  it('con editionId consulta la edición anterior como historial', async () => {
    const result = await service.findAll(false, 100, 1, ids.previous);

    expect(result.edition).toMatchObject({ id: ids.previous, readOnly: true });
    expect(codes(result.data)).toEqual([970001, 970002]);
  });

  it('el aviso de inscripciones cuenta solo los NRC activos de la edición activa', async () => {
    await expect(service.registrationReadiness()).resolves.toEqual({
      edition: { id: ids.current, title: `BG-23 ${tag} 30` },
      activeNrcCount: 1,
      hasActiveNrcs: true,
    });
  });

  it('sin NRC activos en la edición activa avisa aunque la anterior tenga NRC', async () => {
    await prisma.nRC.update({ where: { id: ids.currentActiveNrc }, data: { isActive: false } });
    try {
      await expect(service.registrationReadiness()).resolves.toMatchObject({
        activeNrcCount: 0,
        hasActiveNrcs: false,
      });
    } finally {
      await prisma.nRC.update({ where: { id: ids.currentActiveNrc }, data: { isActive: true } });
    }
  });

  it('ARK-236 (BG-46): lista, detalle, crear y editar no devuelven el password del profesor', async () => {
    const safeProfessor = {
      id: ids.professor,
      firstName: 'Profesor',
      lastName: tag,
      email: `profesor-${tag}@bg23.test`,
    };
    const expectSafe = (nrc: unknown) => {
      expect(JSON.stringify(nrc)).not.toContain('password');
      expect(JSON.stringify(nrc)).not.toContain('hashdeprueba');
      expect((nrc as { professor: unknown }).professor).toEqual(safeProfessor);
    };

    const list = await service.findAll(false, 100, 1);
    expect(list.data).toHaveLength(1);
    expectSafe(list.data[0]);

    expectSafe(await service.findOne(ids.currentActiveNrc));

    const created = await service.create({
      code: 970005,
      subjectId: ids.subject,
      professorId: ids.professor,
    });
    ids.nrcs.push(created.id);
    expectSafe(created);

    expectSafe(await service.update(created.id, { code: 970006 }));
  });
});
