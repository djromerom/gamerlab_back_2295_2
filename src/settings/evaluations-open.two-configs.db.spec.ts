import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { VideogamesService as PendingGamesService } from '../pending-games/pg.service';
import { GradedGamesService } from '../graded-games/gg.service';
import { SettingsService } from './settings.service';
import { EVENT_CONFIGURATION_NOT_FOUND } from './active-edition-config';

/**
 * Integración (ARK-134 / BG-21) contra Postgres real: con dos filas de `configuracion_evento`
 * (una por edición), la puerta «evaluaciones abiertas» del jurado lee siempre la de la edición
 * ACTIVE, la misma que cambia el panel del administrador, y nunca la de otra edición.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Crea dos
 * ediciones de 2098; durante la prueba la «actual» es la ACTIVE y la(s) activa(s) del seed pasan a
 * INACTIVE. Al terminar restaura los estados y borra lo que creó.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Evaluaciones abiertas: configuración de la edición activa (BD real)', () => {
  const prisma = new PrismaService();
  const blobRefs = { resolveInPlace: () => Promise.resolve() } as any;
  const evaluation = new EvaluationService(prisma, {} as any, {} as any);
  const pending = new PendingGamesService(prisma, blobRefs);
  const graded = new GradedGamesService(prisma, blobRefs);
  const settings = new SettingsService(prisma);

  const tag = randomUUID().slice(0, 6);
  const jurorId = `bg21-${tag}`;
  const ids = { previous: 0, current: 0, wasActive: [] as number[] };

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2098,
        semester,
        title: `BG-21 ${tag} ${semester}`,
        startsAt: new Date('2098-01-01T00:00:00Z'),
        endsAt: new Date('2098-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  /** Deja exactamente las filas pedidas: `undefined` = la edición no tiene configuración. */
  const configure = async (previousOpen?: boolean, currentOpen?: boolean) => {
    await prisma.eventConfiguration.deleteMany({
      where: { editionId: { in: [ids.previous, ids.current] } },
    });
    if (previousOpen !== undefined) {
      await prisma.eventConfiguration.create({
        data: { editionId: ids.previous, evaluationsOpen: previousOpen, registrationsOpen: previousOpen, showRanking: previousOpen },
      });
    }
    if (currentOpen !== undefined) {
      await prisma.eventConfiguration.create({
        data: { editionId: ids.current, evaluationsOpen: currentOpen },
      });
    }
  };

  /** Las tres puertas del jurado: calificar (lote), pendientes y calificados. */
  const gates: Array<[string, () => Promise<unknown>]> = [
    ['EvaluationService', () => evaluation.createBatchEvaluations(jurorId, { evaluations: [] } as any)],
    ['PendingGamesService', () => pending.getPendingVideogamesCount(jurorId)],
    ['GradedGamesService', () => graded.getGradedVideogamesCount(jurorId)],
  ];

  /** `true` si la llamada pasó la puerta (puede fallar después por otro motivo, p. ej. lote vacío). */
  const passesGate = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return true;
    } catch (error) {
      return !(error instanceof ForbiddenException);
    }
  };

  beforeAll(async () => {
    await prisma.$connect();
    ids.previous = (await edition(1)).id;
    ids.current = (await edition(2)).id;
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
      await prisma.eventConfiguration.deleteMany({
        where: { editionId: { in: [ids.previous, ids.current] } },
      });
      await prisma.edition.deleteMany({
        where: { id: { in: [ids.previous, ids.current] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it.each(gates)(
    '%s: la anterior abierta y la activa cerrada → cerrada (403)',
    async (_name, run) => {
      await configure(true, false);
      await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(gates)(
    '%s: la anterior cerrada y la activa abierta → abierta',
    async (_name, run) => {
      await configure(false, true);
      expect(await passesGate(run)).toBe(true);
    },
  );

  it.each(gates)(
    '%s: la activa sin configuración no usa la de otra edición (403)',
    async (_name, run) => {
      await configure(true, undefined);
      await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('el interruptor del panel escribe en la edición activa y el jurado ve el cambio', async () => {
    await configure(true, false);
    const [, runPending] = gates[1];
    await expect(runPending()).rejects.toBeInstanceOf(ForbiddenException);

    await expect(settings.updateEvaluationStatus(true)).resolves.toEqual({ evaluationsOpen: true });
    expect(await passesGate(runPending)).toBe(true);
    await expect(settings.getEvaluationsOpen()).resolves.toEqual({ evaluationsOpen: true });

    await settings.updateEvaluationStatus(false);
    await expect(runPending()).rejects.toBeInstanceOf(ForbiddenException);

    // La fila de la edición anterior no se tocó
    const previous = await prisma.eventConfiguration.findUniqueOrThrow({
      where: { editionId: ids.previous },
    });
    expect(previous.evaluationsOpen).toBe(true);
  });

  it('sin configuración de la activa: el panel responde 404 explícito y lo público queda cerrado', async () => {
    await configure(true, undefined);

    const error = await settings.getEvaluationsOpen().catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({ code: EVENT_CONFIGURATION_NOT_FOUND });

    await expect(settings.getRegistrationsOpen()).resolves.toEqual({ registrationsOpen: false });
    await expect(settings.isRankingVisible()).resolves.toBe(false);
  });
});
