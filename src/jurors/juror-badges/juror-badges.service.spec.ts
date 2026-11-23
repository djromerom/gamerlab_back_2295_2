import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { REQUIRED_SERVICE_KEY } from 'src/auth/decorators/required-service.decorator';
import { CertificatesService } from 'src/certificates/certificates.service';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { JurorBadgesController } from './juror-badges.controller';
import { JurorBadgesService } from './juror-badges.service';
import { BadgePaperSize } from './badge-template';
import { BadgesPdfQueryDto } from './dto/generate-badges.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

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
      // Ids con forma real (UUID, 36 caracteres): no caben en un token de 22, así que la
      // comprobación de abajo no puede fallar por azar. Con 'u2' fallaba ~1 de cada 200 corridas
      // en CI cuando el token aleatorio traía «u2» por casualidad (PR de ARK-194).
      prisma.user.findMany.mockResolvedValue([
        juror('7f9c2b1e-4d3a-4b5c-9e8f-1a2b3c4d5e6f'),
        juror('0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'),
      ]);
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
          reason: 'No es jurado de la edición activa',
        },
        {
          jurorId: 'u1',
          name: 'Ana',
          reason: 'Falta el nombre o el apellido del jurado',
        },
      ]);
    });

    it('solo considera a los jurados de la edición activa (BG-16)', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.jurorBadge.findMany.mockResolvedValue([]);
      prisma.jurorBadge.createMany.mockResolvedValue({ count: 0 });

      await service.generate(['u1']);

      expect(callArg<{ where: unknown }>(prisma.user.findMany).where).toEqual(
        jurorsOfEdition(3, ['u1']),
      );
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

    it('404 si el usuario no es jurado de la edición activa (BG-16)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.regenerate('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(callArg<{ where: unknown }>(prisma.user.findFirst).where).toEqual(
        jurorsOfEdition(3, ['x']),
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

    it('excluye escarapelas viejas de quien ya no es jurado de la edición (BG-16)', async () => {
      prisma.jurorBadge.findMany.mockResolvedValue([]);

      await service.list();

      expect(
        callArg<{ where: unknown }>(prisma.jurorBadge.findMany).where,
      ).toMatchObject({
        editionId: 3,
        isActive: true,
        juror: jurorsOfEdition(3),
      });
    });
  });

  describe('validateToken', () => {
    it('solo acepta tokens activos de la edición activa y de jurados de ella (BG-16)', async () => {
      prisma.jurorBadge.findFirst.mockResolvedValue(null);
      await expect(service.validateToken('viejo')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(
        callArg<{ where: unknown }>(prisma.jurorBadge.findFirst).where,
      ).toEqual({
        token: 'viejo',
        isActive: true,
        editionId: 3,
        juror: jurorsOfEdition(3),
      });
    });

    it('sin edición activa responde 404 sin buscar la escarapela', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      await expect(service.validateToken('tok')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.jurorBadge.findFirst).not.toHaveBeenCalled();
    });

    it('devuelve los datos de la escarapela válida', async () => {
      prisma.jurorBadge.findFirst.mockResolvedValue({
        id: 7,
        jurorId: 'u1',
        editionId: 3,
        juror: juror('u1'),
      });
      await expect(service.validateToken('tok')).resolves.toEqual({
        badgeId: 7,
        jurorId: 'u1',
        editionId: 3,
        name: 'Ana Pérez',
        category: 'Junior',
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

    it('por defecto pide a Gotenberg la hoja tabloide sin márgenes', async () => {
      prisma.jurorBadge.findMany.mockResolvedValue([
        { jurorId: 'u1', token: 'tok', juror: juror('u1') },
      ]);
      certificates.convertHtmlToPdf.mockResolvedValue(Buffer.from('pdf'));

      await service.generatePdf();

      expect(certificates.convertHtmlToPdf).toHaveBeenCalledWith(
        expect.any(String),
        { paperWidth: '11in', paperHeight: '17in', margin: '0' },
      );
    });

    it('con LETTER pide a Gotenberg carta horizontal', async () => {
      prisma.jurorBadge.findMany.mockResolvedValue([
        { jurorId: 'u1', token: 'tok', juror: juror('u1') },
      ]);
      certificates.convertHtmlToPdf.mockResolvedValue(Buffer.from('pdf'));

      await service.generatePdf(undefined, BadgePaperSize.LETTER);

      const html = callArg<string>(certificates.convertHtmlToPdf);
      expect(html).toContain('@page { size: 279.4mm 215.9mm;');
      expect(certificates.convertHtmlToPdf).toHaveBeenCalledWith(
        expect.any(String),
        { paperWidth: '11in', paperHeight: '8.5in', margin: '0' },
      );
    });

    it('imprime solo nombre y QR, sin junior ni senior, también para profesores (HU-35)', async () => {
      prisma.jurorBadge.findMany.mockResolvedValue([
        {
          jurorId: 'u1',
          token: 't1',
          juror: juror('u1', { jurorCategory: 'JUNIOR' }),
        },
        {
          jurorId: 'u2',
          token: 't2',
          juror: juror('u2', { jurorCategory: 'SENIOR' }),
        },
        {
          jurorId: 'p1',
          token: 't3',
          juror: juror('p1', {
            jurorCategory: null,
            role: { name: 'Profesor' },
          }),
        },
      ]);
      certificates.convertHtmlToPdf.mockResolvedValue(Buffer.from('pdf'));

      await service.generatePdf();

      const html = callArg<string>(certificates.convertHtmlToPdf);
      expect(html.match(/<div class="name">/g)).toHaveLength(3);
      expect(html.match(/<img class="qr"/g)).toHaveLength(3);
      expect(html).not.toMatch(/junior|senior|sin categor|class="category"/i);
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

describe('JurorBadgesController: PDF', () => {
  const pdfFor = async (query: BadgesPdfQueryDto) => {
    const generatePdf = jest.fn().mockResolvedValue(Buffer.from('pdf'));
    const controller = new JurorBadgesController({
      generatePdf,
    } as unknown as JurorBadgesService);
    const file = await controller.pdf(query);
    return { generatePdf, headers: file.getHeaders() };
  };

  it('sin paper usa tabloide y lo dice en el nombre del archivo', async () => {
    const { generatePdf, headers } = await pdfFor({});
    expect(generatePdf).toHaveBeenCalledWith(undefined, BadgePaperSize.TABLOID);
    expect(headers.disposition).toBe(
      'attachment; filename="escarapelas-tabloide.pdf"',
    );
  });

  it('con LETTER genera en carta', async () => {
    const { generatePdf, headers } = await pdfFor({
      paper: BadgePaperSize.LETTER,
      jurorIds: ['id-1'],
    });
    expect(generatePdf).toHaveBeenCalledWith(['id-1'], BadgePaperSize.LETTER);
    expect(headers.disposition).toBe(
      'attachment; filename="escarapelas-carta.pdf"',
    );
  });
});

describe('BadgesPdfQueryDto: paper', () => {
  const errorsFor = (paper: unknown) =>
    validateSync(plainToInstance(BadgesPdfQueryDto, { paper }));

  it.each(['TABLOID', 'LETTER'])('acepta %s', (paper) => {
    expect(errorsFor(paper)).toHaveLength(0);
  });

  it('rechaza otro tamaño con un mensaje en español', () => {
    const [error] = errorsFor('A4');
    expect(error.constraints?.isEnum).toBe('paper debe ser TABLOID o LETTER.');
  });
});
