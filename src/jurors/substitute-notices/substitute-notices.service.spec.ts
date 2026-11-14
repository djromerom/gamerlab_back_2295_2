import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { JurorEditionStatus, JurorType } from '@prisma/client';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import * as path from 'path';
import {
  SUBSTITUTE_NOTICE_TEMPLATE,
  SubstituteNoticesService,
} from './substitute-notices.service';

/**
 * HU-22 (ARK-84): aviso "Te asignaron grupos" al suplente. Prisma y el correo simulados.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));
/** Primer argumento de la primera llamada de un mock, con tipo. */
const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls as T[][])[0][0];
const EDITION = { id: 5, title: 'Feria', status: 'ACTIVE' };

describe('SubstituteNoticesService (HU-22)', () => {
  let tx: {
    jurorEdition: { findFirst: jest.Mock };
    team: { findMany: jest.Mock };
    substituteNotice: { create: jest.Mock };
  };
  let prisma: {
    edition: { findFirst: jest.Mock };
    substituteNotice: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let email: { sendEmail: jest.Mock; isConfigured: jest.Mock };
  let service: SubstituteNoticesService;

  const teamRow = (id: number, teamCode: string, game: string | null = 'Juego') => ({
    id,
    teamCode,
    teamName: `Equipo ${id}`,
    videogame: game ? { name: game } : null,
  });

  beforeEach(() => {
    tx = {
      jurorEdition: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      team: {
        findMany: jest
          .fn()
          .mockResolvedValue([teamRow(7, 'N2-AYP-01'), teamRow(8, 'N0-COL-02', null)]),
      },
      substituteNotice: { create: jest.fn().mockResolvedValue({ id: 99 }) },
    };
    prisma = {
      edition: { findFirst: jest.fn().mockResolvedValue(EDITION) },
      substituteNotice: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    email = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
      isConfigured: jest.fn().mockReturnValue(true),
    };
    service = new SubstituteNoticesService(
      prisma as any,
      email as any,
      { get: (_key: string, fallback: unknown) => fallback } as any,
    );
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('recordAssignment', () => {
    const input = { jurorId: 'sup-1', teamIds: [7], editionId: 5 };

    it('crea un aviso para el suplente confirmado de la edición', async () => {
      await expect(service.recordAssignment(tx as any, input)).resolves.toBe(99);

      expect(tx.jurorEdition.findFirst).toHaveBeenCalledWith({
        where: {
          jurorId: 'sup-1',
          editionId: 5,
          type: JurorType.BACKUP,
          status: JurorEditionStatus.CONFIRMED,
          juror: { isActive: true, role: { name: 'Jurado' } },
        },
        select: { id: true },
      });
    });

    it('varios equipos en la misma operación generan UN aviso con todos (foto + nivel)', async () => {
      await service.recordAssignment(tx as any, { ...input, teamIds: [7, 8, 7] });

      expect(tx.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [7, 8] }, editionId: 5 } }),
      );
      expect(tx.substituteNotice.create).toHaveBeenCalledTimes(1);
      expect(firstArg<{ data: unknown }>(tx.substituteNotice.create).data).toEqual({
        jurorId: 'sup-1',
        editionId: 5,
        teams: {
          create: [
            { teamId: 7, teamCode: 'N2-AYP-01', teamName: 'Equipo 7', videogameName: 'Juego', level: 2 },
            { teamId: 8, teamCode: 'N0-COL-02', teamName: 'Equipo 8', videogameName: null, level: 0 },
          ],
        },
      });
    });

    it('el jurado oficial y el profesor (sin fila BACKUP) no generan aviso', async () => {
      tx.jurorEdition.findFirst.mockResolvedValue(null);

      await expect(service.recordAssignment(tx as any, input)).resolves.toBeNull();
      expect(tx.team.findMany).not.toHaveBeenCalled();
      expect(tx.substituteNotice.create).not.toHaveBeenCalled();
    });

    it('sin equipos (o de otra edición) no crea aviso', async () => {
      await expect(
        service.recordAssignment(tx as any, { ...input, teamIds: [] }),
      ).resolves.toBeNull();
      tx.team.findMany.mockResolvedValue([]);
      await expect(service.recordAssignment(tx as any, input)).resolves.toBeNull();
      expect(tx.substituteNotice.create).not.toHaveBeenCalled();
    });
  });

  describe('correo después de confirmar', () => {
    const notice = {
      id: 99,
      createdAt: new Date('2026-11-26T16:00:00Z'),
      readAt: null,
      teams: [
        { teamId: 7, teamCode: 'N2-AYP-01', teamName: 'Equipo 7', videogameName: 'Juego', level: 2 },
      ],
      juror: { firstName: 'Ana', email: 'ana@test.co' },
    };

    beforeEach(() => prisma.substituteNotice.findUnique.mockResolvedValue(notice));

    it('envía la plantilla solo con el nombre del suplente y los grupos, y guarda SENT', async () => {
      service.sendEmailAfterCommit([99, null, 99]);
      await flush();
      await flush();

      expect(email.sendEmail).toHaveBeenCalledTimes(1);
      const [to, subject, template, params] = email.sendEmail.mock.calls[0] as [
        string,
        string,
        string,
        Record<string, unknown>,
      ];
      expect([to, subject, template]).toEqual([
        'ana@test.co',
        'Te asignaron grupos',
        SUBSTITUTE_NOTICE_TEMPLATE,
      ]);
      expect(params).toEqual({
        firstName: 'Ana',
        message: 'Te asignaron grupos',
        teams: [
          {
            teamId: 7,
            teamCode: 'N2-AYP-01',
            teamName: 'Equipo 7',
            videogameName: 'Juego',
            level: 2,
            levelLabel: 'Nivel 2',
          },
        ],
        pendingUrl: 'http://localhost:5173/pendientes-calificar',
      });
      expect(JSON.stringify(params)).not.toContain('@');
      expect(prisma.substituteNotice.update).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { emailStatus: 'SENT', emailError: null },
      });
    });

    it('si el correo falla guarda FAILED con un motivo corto y no lanza', async () => {
      email.sendEmail.mockRejectedValue(
        new ServiceUnavailableException('Fallo en ACS: Unauthorized'),
      );

      expect(() => service.sendEmailAfterCommit([99])).not.toThrow();
      await flush();
      await flush();

      const { data } = firstArg<{ data: { emailStatus: string; emailError: string } }>(
        prisma.substituteNotice.update,
      );
      expect(data.emailStatus).toBe('FAILED');
      expect(data.emailError).toContain('Fallo en ACS');
      expect(data.emailError.length).toBeLessThanOrEqual(200);
      expect(data.emailError).not.toContain('ana@test.co');
    });

    it('sin claves de ACS (simulación) guarda SKIPPED', async () => {
      email.isConfigured.mockReturnValue(false);

      await expect(service.sendNoticeEmail(99)).resolves.toBe('SKIPPED');
      expect(
        firstArg<{ data: { emailStatus: string } }>(prisma.substituteNotice.update).data
          .emailStatus,
      ).toBe('SKIPPED');
    });

    it('ni un error de base de datos sale de sendEmailAfterCommit', async () => {
      prisma.substituteNotice.findUnique.mockRejectedValue(new Error('db caída'));
      prisma.substituteNotice.update.mockRejectedValue(new Error('db caída'));

      expect(() => service.sendEmailAfterCommit([99])).not.toThrow();
      await flush();
      await flush();
      expect(email.sendEmail).not.toHaveBeenCalled();
    });

    it('sin avisos no hace nada', async () => {
      service.sendEmailAfterCommit([null, undefined]);
      await flush();
      expect(prisma.substituteNotice.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('marcar como leído', () => {
    const row = {
      id: 99,
      createdAt: new Date('2026-11-26T16:00:00Z'),
      readAt: new Date('2026-11-26T16:01:00Z'),
      teams: [],
    };

    it('solo el dueño: filtra por id y jurado, y solo si sigue sin leer', async () => {
      prisma.substituteNotice.findFirst.mockResolvedValue(row);
      const now = new Date('2026-11-26T16:01:00Z');

      const result = await service.markRead('sup-1', 99, now);

      expect(prisma.substituteNotice.updateMany).toHaveBeenCalledWith({
        where: { id: 99, jurorId: 'sup-1', readAt: null },
        data: { readAt: now },
      });
      expect(prisma.substituteNotice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 99, jurorId: 'sup-1' } }),
      );
      expect(result).toMatchObject({ id: 99, readAt: row.readAt, message: 'Te asignaron grupos' });
    });

    it('es idempotente: si ya estaba leído no cambia la hora', async () => {
      prisma.substituteNotice.updateMany.mockResolvedValue({ count: 0 });
      prisma.substituteNotice.findFirst.mockResolvedValue(row);

      const result = await service.markRead('sup-1', 99, new Date('2030-01-01T00:00:00Z'));

      expect(result.readAt).toEqual(row.readAt);
    });

    it('404 si el aviso no es suyo o no existe', async () => {
      prisma.substituteNotice.updateMany.mockResolvedValue({ count: 0 });
      prisma.substituteNotice.findFirst.mockResolvedValue(null);

      await expect(service.markRead('otro', 99)).rejects.toMatchObject({
        status: 404,
        response: { code: 'SUBSTITUTE_NOTICE_NOT_FOUND' },
      });
    });
  });

  describe('consultas', () => {
    it('mis avisos: solo sin leer por defecto, de la edición activa, con el conteo', async () => {
      prisma.substituteNotice.count.mockResolvedValue(1);
      const now = new Date('2026-11-26T16:00:10Z');

      const result = await service.findMine('sup-1', undefined, now);

      expect(prisma.substituteNotice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jurorId: 'sup-1', editionId: 5, readAt: null },
        }),
      );
      expect(result).toMatchObject({
        edition: { id: 5, title: 'Feria' },
        serverTime: now,
        unreadCount: 1,
        data: [],
      });
    });

    it('status=all trae también los leídos, primero los sin leer', async () => {
      const at = (iso: string) => new Date(iso);
      prisma.substituteNotice.findMany.mockResolvedValue([
        { id: 1, createdAt: at('2026-11-26T15:00:00Z'), readAt: at('2026-11-26T15:05:00Z'), teams: [] },
        { id: 2, createdAt: at('2026-11-26T14:00:00Z'), readAt: null, teams: [] },
        { id: 3, createdAt: at('2026-11-26T16:00:00Z'), readAt: null, teams: [] },
      ]);

      const result = await service.findMine('sup-1', 'all');

      expect(firstArg<{ where: unknown }>(prisma.substituteNotice.findMany).where).toEqual({
        jurorId: 'sup-1',
        editionId: 5,
      });
      expect(result.data.map((n) => n.id)).toEqual([3, 2, 1]);
    });

    it('sin edición activa: 404 NO_ACTIVE_EDITION', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      await expect(service.findMine('sup-1')).rejects.toMatchObject({ status: 404 });
      await expect(service.listUnread()).rejects.toMatchObject({ status: 404 });
    });

    it('panel: suplentes con avisos sin leer, con nombre y cantidad de grupos (sin correo)', async () => {
      prisma.substituteNotice.findMany.mockResolvedValue([
        {
          id: 4,
          jurorId: 'sup-1',
          createdAt: new Date('2026-11-26T16:00:00Z'),
          emailStatus: 'FAILED',
          juror: { firstName: 'Ana', lastName: 'Pérez' },
          _count: { teams: 2 },
        },
      ]);

      const result = await service.listUnread();

      expect(firstArg<{ where: unknown }>(prisma.substituteNotice.findMany).where).toEqual({
        editionId: 5,
        readAt: null,
      });
      expect(result.totals).toEqual({ unread: 1, jurors: 1 });
      expect(result.data).toEqual([
        {
          noticeId: 4,
          jurorId: 'sup-1',
          name: 'Ana Pérez',
          createdAt: new Date('2026-11-26T16:00:00Z'),
          teamCount: 2,
          emailStatus: 'FAILED',
        },
      ]);
    });
  });

  it('la plantilla del correo muestra los grupos, el nivel y a dónde ir', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'email', 'templates', `${SUBSTITUTE_NOTICE_TEMPLATE}.hbs`),
      'utf8',
    );
    const html = handlebars.compile(source)({
      firstName: 'Ana',
      message: 'Te asignaron grupos',
      teams: [
        { teamCode: 'N2-AYP-01', teamName: 'Equipo <7>', videogameName: null, levelLabel: 'Nivel 2' },
      ],
      pendingUrl: 'https://arkad.test/pendientes-calificar',
    });

    expect(html).toContain('Te asignaron grupos');
    expect(html).toContain('Ana');
    expect(html).toContain('N2-AYP-01');
    expect(html).toContain('Equipo &lt;7&gt;');
    expect(html).toContain('Nivel 2');
    expect(html).toContain('href="https://arkad.test/pendientes-calificar"');
  });
});
