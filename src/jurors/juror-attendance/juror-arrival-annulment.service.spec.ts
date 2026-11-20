import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EditionStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { REQUIRED_SERVICE_KEY } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnnulJurorArrivalDto } from './dto/annul-juror-arrival.dto';
import { JurorArrivalAnnulmentService } from './juror-arrival-annulment.service';
import { JurorAttendanceController } from './juror-attendance.controller';

const ARRIVAL = new Date('2026-11-26T13:05:00.000Z');
const ANNULLED_AT = new Date('2026-11-26T13:20:00.000Z');

const activeAttendance = {
  isActive: true,
  edition: { status: EditionStatus.ACTIVE, title: 'ARKAD 2026-30' },
};

const annulledRow = {
  id: 31,
  checkedInAt: ARRIVAL,
  method: 'QR',
  annulledAt: ANNULLED_AT,
  annulmentReason: 'QR del vecino',
  edition: { id: 5, title: 'ARKAD 2026-30' },
  juror: { id: 'juror-1', firstName: 'Luis', lastName: 'Gómez' },
  checkedInBy: { id: 'staff-1', firstName: 'Staff', lastName: 'Mesa 1' },
  annulledBy: { id: 'admin-1', firstName: 'Admin', lastName: null },
};

describe('JurorArrivalAnnulmentService (BG-49)', () => {
  let service: JurorArrivalAnnulmentService;
  const prisma = {
    jurorAttendance: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.jurorAttendance.findUnique.mockResolvedValue(activeAttendance);
    prisma.jurorAttendance.updateMany.mockResolvedValue({ count: 1 });
    prisma.jurorAttendance.findUniqueOrThrow.mockResolvedValue(annulledRow);
    const moduleRef = await Test.createTestingModule({
      providers: [
        JurorArrivalAnnulmentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(JurorArrivalAnnulmentService);
  });

  it('desactiva la llegada (borrado lógico) con quién, cuándo y el motivo', async () => {
    await service.annul(31, 'admin-1', 'QR del vecino');

    const [[args]] = prisma.jurorAttendance.updateMany.mock.calls as [
      [{ where: unknown; data: Record<string, unknown> }],
    ];
    // Solo si sigue activa: dos anulaciones simultáneas no pisan el registro.
    expect(args.where).toEqual({ id: 31, isActive: true });
    expect(args.data).toMatchObject({
      isActive: false,
      annulledById: 'admin-1',
      annulmentReason: 'QR del vecino',
    });
    expect(args.data.annulledAt).toBeInstanceOf(Date);
  });

  it('sin motivo guarda null', async () => {
    await service.annul(31, 'admin-1');
    const [[args]] = prisma.jurorAttendance.updateMany.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    expect(args.data.annulmentReason).toBeNull();
  });

  it('responde la llegada anulada y el jurado vuelve a MISSING, sin correos', async () => {
    const result = await service.annul(31, 'admin-1', 'QR del vecino');

    expect(result).toEqual({
      attendanceId: 31,
      edition: { id: 5, title: 'ARKAD 2026-30' },
      juror: { id: 'juror-1', name: 'Luis Gómez' },
      checkedInAt: ARRIVAL,
      method: 'QR',
      checkedInBy: { id: 'staff-1', name: 'Staff Mesa 1' },
      annulledAt: ANNULLED_AT,
      annulledBy: { id: 'admin-1', name: 'Admin' },
      annulmentReason: 'QR del vecino',
      jurorStatus: 'MISSING',
    });
    expect(JSON.stringify(result)).not.toContain('@');
  });

  it('404 ATTENDANCE_NOT_FOUND si la llegada no existe', async () => {
    prisma.jurorAttendance.findUnique.mockResolvedValue(null);

    const error = await service.annul(999, 'admin-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error).toMatchObject({
      response: { code: 'ATTENDANCE_NOT_FOUND' },
    });
    expect(prisma.jurorAttendance.updateMany).not.toHaveBeenCalled();
  });

  it('409 ARRIVAL_ALREADY_ANNULLED si ya estaba anulada', async () => {
    prisma.jurorAttendance.findUnique.mockResolvedValue({
      ...activeAttendance,
      isActive: false,
    });

    const error = await service.annul(31, 'admin-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toMatchObject({
      response: { code: 'ARRIVAL_ALREADY_ANNULLED' },
    });
    expect(prisma.jurorAttendance.updateMany).not.toHaveBeenCalled();
  });

  it('409 si otro administrador la anuló entre la lectura y la escritura', async () => {
    prisma.jurorAttendance.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.annul(31, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.jurorAttendance.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('400 EDITION_READ_ONLY si la llegada es de una edición que no es la activa', async () => {
    prisma.jurorAttendance.findUnique.mockResolvedValue({
      isActive: true,
      edition: { status: EditionStatus.ARCHIVED, title: 'ARKAD 2026-10' },
    });

    const error = await service.annul(31, 'admin-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toMatchObject({ response: { code: 'EDITION_READ_ONLY' } });
    expect(prisma.jurorAttendance.updateMany).not.toHaveBeenCalled();
  });
});

describe('AnnulJurorArrivalDto', () => {
  const check = async (body: object) => {
    const dto = plainToInstance(AnnulJurorArrivalDto, body);
    return { dto, errors: await validate(dto) };
  };

  it('acepta el cuerpo vacío y convierte un motivo en blanco en undefined', async () => {
    expect((await check({})).errors).toHaveLength(0);
    const { dto, errors } = await check({ reason: '   ' });
    expect(errors).toHaveLength(0);
    expect(dto.reason).toBeUndefined();
  });

  it('recorta el motivo y rechaza más de 500 caracteres', async () => {
    expect((await check({ reason: '  QR del vecino ' })).dto.reason).toBe(
      'QR del vecino',
    );
    expect((await check({ reason: 'x'.repeat(501) })).errors).toHaveLength(1);
  });
});

describe('JurorAttendanceController.annul (permisos)', () => {
  it('exige el servicio AnnulJurorArrival (no el de lectura que tiene Staff)', () => {
    const handler = Object.getOwnPropertyDescriptor(
      JurorAttendanceController.prototype,
      'annul',
    )?.value as object;
    expect(Reflect.getMetadata(REQUIRED_SERVICE_KEY, handler)).toBe(
      'AnnulJurorArrival',
    );
    const guards = Reflect.getMetadata(
      '__guards__',
      JurorAttendanceController,
    ) as unknown[];
    expect(guards).toContain(RolePermissionGuard);
  });
});
