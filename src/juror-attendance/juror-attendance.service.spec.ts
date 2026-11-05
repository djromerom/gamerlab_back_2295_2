import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { REQUIRED_SERVICE_KEY } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { jurorsOfEdition } from '../juror-edition/jurors-of-edition';
import { PrismaService } from '../prisma/prisma.service';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { JurorAttendanceController } from './juror-attendance.controller';
import { JurorAttendanceService } from './juror-attendance.service';

jest.setTimeout(30000);

const EDITION = { id: 5, title: 'ARKAD 2026-30' };
const ARRIVAL = new Date('2026-11-26T13:05:00.000Z');

const callArg = <T>(mock: jest.Mock, call = 0): T =>
  (mock.mock.calls as unknown[][])[call][0] as T;

const query = (extra: Partial<ListAttendanceQueryDto> = {}) =>
  ({ page: 1, limit: 50, ...extra }) as ListAttendanceQueryDto;

const presentProfessor = {
  id: 'prof-1',
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@uninorte.edu.co',
  jurorCategory: null,
  role: { name: 'Profesor' },
  jurorBadges: [{ id: 10 }],
  attendances: [
    {
      checkedInAt: ARRIVAL,
      method: 'QR',
      checkedInBy: { id: 'staff-1', firstName: 'Staff', lastName: 'Mesa 1' },
    },
  ],
};

const missingJuror = {
  id: 'juror-1',
  firstName: 'Luis',
  lastName: 'Gómez',
  jurorCategory: 'JUNIOR',
  role: { name: 'Jurado' },
  jurorBadges: [],
  attendances: [],
};

describe('JurorAttendanceService', () => {
  let service: JurorAttendanceService;
  const prisma = {
    edition: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue(EDITION);
    prisma.user.findMany.mockResolvedValue([presentProfessor, missingJuror]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        JurorAttendanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(JurorAttendanceService);
  });

  it('lista solo a los jurados de la edición activa y su asistencia en ella', async () => {
    await service.list(query());

    const args = callArg<{
      where: unknown;
      select: {
        attendances: { where: unknown };
        jurorBadges: { where: unknown };
      };
    }>(prisma.user.findMany);
    expect(args.where).toEqual(jurorsOfEdition(EDITION.id));
    expect(args.select.attendances.where).toEqual({
      editionId: EDITION.id,
      isActive: true,
    });
    expect(args.select.jurorBadges.where).toEqual({
      editionId: EDITION.id,
      isActive: true,
    });
  });

  it('marca Presente con hora, método y quién lo registró, y Falta con todo en null', async () => {
    const result = await service.list(query());

    expect(result.edition).toEqual(EDITION);
    expect(result.data).toEqual([
      {
        jurorId: 'juror-1',
        name: 'Luis Gómez',
        category: 'Junior',
        isProfessor: false,
        hasBadge: false,
        status: 'MISSING',
        checkedInAt: null,
        method: null,
        checkedInBy: null,
      },
      {
        jurorId: 'prof-1',
        name: 'Ana Pérez',
        category: 'Senior',
        isProfessor: true,
        hasBadge: true,
        status: 'PRESENT',
        checkedInAt: ARRIVAL,
        method: 'QR',
        checkedInBy: { id: 'staff-1', name: 'Staff Mesa 1' },
      },
    ]);
    expect(result.totals).toEqual({ present: 1, missing: 1, total: 2 });
  });

  it('no devuelve correos aunque Prisma los traiga', async () => {
    const result = await service.list(query());
    for (const item of result.data) {
      expect(item).not.toHaveProperty('email');
    }
    expect(JSON.stringify(result)).not.toContain('@');
  });

  it('el select no pide el correo ni del jurado ni de quien registró', async () => {
    await service.list(query());
    const select = callArg<{
      select: Record<string, unknown> & {
        attendances: { select: { checkedInBy: { select: object } } };
      };
    }>(prisma.user.findMany).select;
    expect(select).not.toHaveProperty('email');
    expect(select.attendances.select.checkedInBy.select).not.toHaveProperty(
      'email',
    );
  });

  it('responde 404 NO_ACTIVE_EDITION si no hay edición activa', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);
    await expect(service.list(query())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.list(query())).rejects.toMatchObject({
      response: { code: 'NO_ACTIVE_EDITION' },
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('el filtro de estado no cambia los totales', async () => {
    const result = await service.list(query({ status: 'PRESENT' }));
    expect(result.data.map((i) => i.jurorId)).toEqual(['prof-1']);
    expect(result.totals).toEqual({ present: 1, missing: 1, total: 2 });
  });
});

describe('JurorAttendanceController (permisos)', () => {
  it('exige RolePermissionGuard y el servicio ViewJurorAttendance', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      JurorAttendanceController,
    ) as unknown[];
    expect(guards).toContain(RolePermissionGuard);
    expect(
      Reflect.getMetadata(REQUIRED_SERVICE_KEY, JurorAttendanceController),
    ).toBe('ViewJurorAttendance');
  });
});
