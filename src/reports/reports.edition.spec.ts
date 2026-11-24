import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { EmailService } from '../email/email.service';
import { ROLE_IDS } from '../auth/constants/roles';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

/**
 * ARK-135 (BG-22): los reportes de Estadísticas y los certificados de jurado son de UNA edición:
 * por defecto la activa, o la pedida con `?editionId=` (historial). Antes contaban las
 * evaluaciones, juegos y NRC de todas las ediciones.
 */
describe('Reportes por edición (ARK-135)', () => {
  const active = { id: 5, title: 'Feria 5', status: 'ACTIVE', year: 2026, semester: 2 };
  const previous = { id: 4, title: 'Feria 4', status: 'INACTIVE', year: 2026, semester: 1 };
  const admin = { id: 'admin', roleId: ROLE_IDS.ADMIN } as any;

  const prisma = {
    edition: { findFirst: jest.fn(), findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    videogame: { findMany: jest.fn() },
    teamFinalScore: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn() },
    nRC: { findMany: jest.fn() },
    subject: { findMany: jest.fn() },
  };
  const settings = { isRankingVisible: jest.fn() };
  const service = new ReportsService(prisma as any, settings as any, blobRefsPassthrough() as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.edition.findFirst.mockResolvedValue(active);
    prisma.edition.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.id === previous.id ? previous : null),
    );
    prisma.user.findMany.mockResolvedValue([]);
    prisma.videogame.findMany.mockResolvedValue([]);
    prisma.teamFinalScore.findMany.mockResolvedValue([]);
    prisma.evaluation.findMany.mockResolvedValue([]);
    prisma.nRC.findMany.mockResolvedValue([{ id: 1, code: 1234, subject: { name: 'M' } }]);
    prisma.subject.findMany.mockResolvedValue([]);
    settings.isRankingVisible.mockResolvedValue(true);
  });

  describe('getJuradosData (tabla por jurado)', () => {
    it('sin editionId: asignados y evaluados solo de la edición activa', async () => {
      await service.getJuradosData();
      const select = prisma.user.findMany.mock.calls[0][0].select;
      expect(select.teamsToEvaluate.where).toMatchObject({ editionId: active.id });
      expect(select.evaluationsSubmitted.where).toMatchObject({
        isActive: true,
        editionId: active.id,
      });
    });

    it('con editionId: el historial de esa edición', async () => {
      await service.getJuradosData(previous.id);
      const select = prisma.user.findMany.mock.calls[0][0].select;
      expect(select.teamsToEvaluate.where.editionId).toBe(previous.id);
      expect(select.evaluationsSubmitted.where.editionId).toBe(previous.id);
      expect(prisma.edition.findFirst).not.toHaveBeenCalled();
    });

    it('una edición que no existe responde 404', async () => {
      await expect(service.getJuradosData(999)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('sin edición activa no cuenta evaluaciones de ninguna edición', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      await service.getJuradosData();
      const select = prisma.user.findMany.mock.calls[0][0].select;
      expect(select.evaluationsSubmitted.where.editionId).toBe(-1);
      expect(select.teamsToEvaluate.where.editionId).toBe(-1);
    });
  });

  it('juegos de Estadísticas: solo los equipos de la edición', async () => {
    await service.getVideogamesData(admin);
    expect(prisma.videogame.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      team: { editionId: active.id, notGradable: false },
    });
    await service.getVideogamesData(admin, previous.id);
    expect(prisma.videogame.findMany.mock.calls[1][0].where.team).toEqual({
      editionId: previous.id,
      notGradable: false,
    });
  });

  it('Excel de juegos: filtra la edición además de materia y NRC', async () => {
    await service.getVideogamesDataFilter('Algoritmos', 1234, previous.id);
    const where = prisma.videogame.findMany.mock.calls[0][0].where;
    expect(where.team.editionId).toBe(previous.id);
    expect(where.team.members.some.nrcs.some.code).toBe(1234);
  });

  it('promedio por NRC: NRC y juegos de la edición', async () => {
    await service.getNrcWithSubjectNameAndAverage(admin);
    expect(prisma.nRC.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      editionId: active.id,
    });
    expect(prisma.videogame.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      team: { editionId: active.id, notGradable: false },
    });
  });

  it('promedio por materia: las materias son globales, sus NRC de la edición', async () => {
    await service.getSubjectAverageScores(admin, previous.id);
    const args = prisma.subject.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ isActive: true });
    expect(args.include.nrcs.where).toEqual({ isActive: true, editionId: previous.id });
  });

  describe('controlador', () => {
    const reports = {
      getVideogamesData: jest.fn().mockResolvedValue([]),
      getNrcWithSubjectNameAndAverage: jest.fn().mockResolvedValue([]),
      getSubjectAverageScores: jest.fn().mockResolvedValue([]),
      getJuradosData: jest.fn().mockResolvedValue([]),
      getJuradosDataForTeamLeader: jest.fn().mockResolvedValue([]),
    };
    const controller = new ReportsController(reports as any);

    it('un editionId que no es entero positivo responde 400', async () => {
      await expect(controller.getWithMateriaYNRC(admin, 'abc')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        controller.getNrcWithSubjectNameAndAverage(admin, '0'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getJuradosData(true, 'admin', '-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('videojuegoData pasa la edición pedida o, sin ella, la activa (BG-67: sin caché pública)', async () => {
      await controller.getWithMateriaYNRC(admin);
      expect(reports.getVideogamesData).toHaveBeenLastCalledWith(admin, undefined);
      await controller.getWithMateriaYNRC(admin, '4');
      expect(reports.getVideogamesData).toHaveBeenLastCalledWith(admin, 4);
    });

    it('JuradosData: el admin pasa la edición; el líder siempre ve su equipo de la activa', async () => {
      await controller.getJuradosData(true, 'admin', '4');
      expect(reports.getJuradosData).toHaveBeenCalledWith(4);
      await controller.getJuradosData(false, 'student-1', '4', 'matias@uninorte.edu.co');
      expect(reports.getJuradosDataForTeamLeader).toHaveBeenCalledWith(
        'student-1',
        'matias@uninorte.edu.co',
      );
    });
  });
});

describe('Certificados de jurado por edición (ARK-135)', () => {
  const ENV: Record<string, string> = {
    EVENT_DATE_TEXT: '26 de noviembre',
    EVENT_TIME_TEXT: '8:00 am',
    EVENT_PLACE_TEXT: 'Coliseo',
  };
  const edition = {
    id: 5,
    title: 'Feria 5',
    status: 'ACTIVE',
    year: 2026,
    semester: 2,
    startsAt: new Date('2026-11-26T13:00:00.000Z'),
  };

  function build() {
    const prisma = {
      edition: { findFirst: jest.fn().mockResolvedValue(edition) },
      fairSchedule: { findUnique: jest.fn().mockResolvedValue(null) },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'u1', firstName: 'Ana', lastName: 'Gómez', email: 'a@b.co' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'u1' }),
      },
    };
    const certificates = {
      generateJurorCertificateHtml: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const config = { get: (key: string, def?: unknown) => ENV[key] ?? def };
    const service = new EmailService(prisma as any, certificates as any, config as any);
    const send = jest.spyOn(service, 'sendEmail').mockResolvedValue(undefined);
    return { service, prisma, send };
  }

  it('el envío masivo solo busca jurados confirmados en la edición activa', async () => {
    const { service, prisma } = build();
    const result = await service.sendAllJurorCertificates();
    const where = prisma.user.findMany.mock.calls[0][0].where;
    const [ofEdition, role] = where.AND;
    expect(role).toEqual({ role: { name: 'Jurado' } });
    expect(JSON.stringify(ofEdition)).toContain('"editionId":5');
    expect(JSON.stringify(ofEdition)).toContain('"status":"CONFIRMED"');
    expect(result.message).toContain('Feria 5');
  });

  it('un jurado que no participa en la edición activa no recibe certificado (400)', async () => {
    const { service, prisma, send } = build();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.resendJurorCertEmail('u1')).rejects.toThrow(
      /Ana Gómez no participa en «Feria 5»/,
    );
    await expect(service.resendJurorCertEmail('u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('un jurado de la edición activa recibe su certificado con el año de esa edición', async () => {
    const { service, prisma, send } = build();
    await service.resendJurorCertEmail('u1');
    expect(JSON.stringify(prisma.user.findFirst.mock.calls[0][0].where)).toContain(
      '"editionId":5',
    );
    expect(send.mock.calls[0][3]).toMatchObject({ eventDateWithYear: '26 de noviembre de 2026' });
  });
});
