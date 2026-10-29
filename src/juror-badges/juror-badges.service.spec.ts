import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { REQUIRED_SERVICE_KEY } from '../auth/decorators/required-service.decorator';
import { CertificatesService } from '../certificates/certificates.service';
import { PrismaService } from '../prisma/prisma.service';
import { JurorBadgesController } from './juror-badges.controller';
import { JurorBadgesService } from './juror-badges.service';

// Compilar el módulo de pruebas puede tardar más de 5 s cuando corre toda la suite en paralelo.
jest.setTimeout(30000);

interface CreatedBadge {
  jurorId: string;
  editionId: number;
  token: string;
}

/** Primer argumento de una llamada a un mock, tipado. */
const callArg = <T>(mock: jest.Mock, call = 0): T =>
  (mock.mock.calls as unknown[][])[call][0] as T;

const juror = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  firstName: 'Ana',
  lastName: 'Pérez',
  jurorCategory: 'JUNIOR',
  role: { name: 'Jurado' },
  ...over,
});

describe('JurorBadgesService', () => {
  let service: JurorBadgesService;
  const prisma = {
    edition: { findFirst: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    jurorBadge: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const certificates = { convertHtmlToPdf: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue({ id: 3, title: 'ARKAD' });
    const module = await Test.createTestingModule({
      providers: [
        JurorBadgesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CertificatesService, useValue: certificates },
      ],
    }).compile();
    service = module.get(JurorBadgesService);
  });

  describe('generate', () => {
    it('crea un token único por jurado sin escarapela y no incluye datos personales', async () => {
      prisma.user.findMany.mockResolvedValue([juror('u1'), juror('u2')]);
      prisma.jurorBadge.findMany.mockResolvedValue([]);
      prisma.jurorBadge.createMany.mockResolvedValue({ count: 2 });

      const result = await service.generate();

      const { data } = callArg<{ data: CreatedBadge[] }>(
        prisma.jurorBadge.createMany,
      );
      expect(data).toHaveLength(2);
      expect(data[0].token).not.toEqual(data[1].token);
      for (const row of data) {
        expect(row.editionId).toBe(3);
        expect(row.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(row.token).not.toContain(row.jurorId);
      }
      expect(result).toEqual({
        editionId: 3,
        created: 2,
        existing: 0,
        skipped: [],
      });
    });

    it('es idempotente: no vuelve a crear a quien ya tiene escarapela activa', async () => {
      prisma.user.findMany.mockResolvedValue([juror('u1'), juror('u2')]);
      prisma.jurorBadge.findMany.mockResolvedValue([{ jurorId: 'u1' }]);
      prisma.jurorBadge.createMany.mockResolvedValue({ count: 1 });

      const result = await service.generate();

      const { data } = callArg<{ data: CreatedBadge[] }>(
        prisma.jurorBadge.createMany,
      );
      expect(data.map((d) => d.jurorId)).toEqual(['u2']);
      expect(result.created).toBe(1);
      expect(result.existing).toBe(1);
    });

    it('omite al jurado sin apellido y al id que no es jurado activo', async () => {
      prisma.user.findMany.mockResolvedValue([
        juror('u1', { lastName: '  ' }),
        juror('u2'),
      ]);
      prisma.jurorBadge.findMany.mockResolvedValue([]);
      prisma.jurorBadge.createMany.mockResolvedValue({ count: 1 });

      const result = await service.generate(['u1', 'u2', 'ghost']);

      const { data } = callArg<{ data: CreatedBadge[] }>(
        prisma.jurorBadge.createMany,
      );
      expect(data.map((d) => d.jurorId)).toEqual(['u2']);
      expect(
        [...result.skipped].sort((x, y) => x.jurorId.localeCompare(y.jurorId)),
      ).toEqual([
        {
          jurorId: 'ghost',
          name: null,
          reason: 'No es un jurado o profesor activo',
        },
        {
          jurorId: 'u1',
          name: 'Ana',
          reason: 'Falta el nombre o el apellido del jurado',
        },
      ]);
    });

    it('falla si no hay edición activa', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      await expect(service.generate()).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('regenerate', () => {
    it('desactiva la escarapela anterior y crea una nueva en una transacción', async () => {
      prisma.user.findFirst.mockResolvedValue(juror('u1'));
      prisma.$transaction.mockResolvedValue([]);

      const result = await service.regenerate('u1');

      expect(prisma.jurorBadge.updateMany).toHaveBeenCalledWith({
        where: { jurorId: 'u1', editionId: 3, isActive: true },
        data: { isActive: false },
      });
      expect(prisma.jurorBadge.create).toHaveBeenCalledWith({
        data: { jurorId: 'u1', editionId: 3, token: result.token },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('404 si el usuario no es un jurado activo', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.regenerate('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('devuelve nombre, categoría y token; el profesor cuenta como senior', async () => {
      prisma.jurorBadge.findMany.mockResolvedValue([
        {
          jurorId: 'p1',
          token: 'tok',
          juror: juror('p1', {
            jurorCategory: null,
            role: { name: 'Profesor' },
          }),
        },
      ]);

      const result = await service.list();

      expect(result.data).toEqual([
        { jurorId: 'p1', name: 'Ana Pérez', category: 'Senior', token: 'tok' },
      ]);
    });
  });

  describe('validateToken', () => {
    it('solo acepta tokens activos de la edición activa', async () => {
      prisma.jurorBadge.findFirst.mockResolvedValue(null);
      await expect(service.validateToken('viejo')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(
        callArg<{ where: unknown }>(prisma.jurorBadge.findFirst).where,
      ).toMatchObject({
        token: 'viejo',
        isActive: true,
        edition: { status: 'ACTIVE' },
      });
    });
  });

  describe('generatePdf', () => {
    it('404 si no hay escarapelas', async () => {
      prisma.jurorBadge.findMany.mockResolvedValue([]);
      await expect(service.generatePdf()).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('arma el HTML con el QR (data URI) y escapa el nombre', async () => {
      prisma.jurorBadge.findMany.mockResolvedValue([
        {
          jurorId: 'u1',
          token: 'tok',
          juror: juror('u1', { firstName: '<b>Ana' }),
        },
      ]);
      certificates.convertHtmlToPdf.mockResolvedValue(Buffer.from('pdf'));

      const pdf = await service.generatePdf();

      expect(pdf.toString()).toBe('pdf');
      const html = callArg<string>(certificates.convertHtmlToPdf);
      expect(html).toContain('data:image/png;base64,');
      expect(html).toContain('&lt;b&gt;Ana');
      expect(html).not.toContain('<b>Ana');
    });
  });
});

describe('JurorBadgesController: permisos', () => {
  it('exige RolePermissionGuard y el servicio ManageJurorBadges', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      JurorBadgesController,
    ) as unknown[];
    expect(guards).toContain(RolePermissionGuard);
    expect(
      Reflect.getMetadata(REQUIRED_SERVICE_KEY, JurorBadgesController),
    ).toBe('ManageJurorBadges');
  });
});
