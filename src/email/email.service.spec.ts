import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import { InternalServerErrorException } from '@nestjs/common';
import { EmailService } from './email.service';

const ENV: Record<string, string> = {
  EVENT_DATE_TEXT: '27 de noviembre',
  EVENT_TIME_TEXT: '9:00 am - 1:00 pm',
  EVENT_PLACE_TEXT: 'Auditorio de prueba',
};

function build(env: Record<string, string | undefined> = ENV) {
  const prisma: Record<string, any> = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'a@b.co',
        firstName: 'Ana',
        lastName: 'Gomez',
        confirmationStatus: { status: 'PENDIENTE' },
      }),
    },
    verificationToken: { deleteMany: jest.fn(), create: jest.fn() },
    edition: { findFirst: jest.fn().mockResolvedValue({ year: 2031 }) },
  };
  const certificates = {
    generateJurorCertificateHtml: jest.fn().mockResolvedValue(Buffer.from('x')),
  };
  const config = {
    get: jest.fn((key: string, def?: unknown) => env[key] ?? def),
  };
  const service = new EmailService(
    prisma as any,
    certificates as any,
    config as any,
  );
  const sendSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue(undefined);
  return { service, prisma, sendSpy };
}

function render(template: string, params: Record<string, unknown>) {
  const src = fs.readFileSync(
    path.join(__dirname, 'templates', `${template}.hbs`),
    'utf8',
  );
  return handlebars.compile(src)(params);
}

describe('EmailService - fecha, hora y lugar configurables', () => {
  it('el correo de verificación usa EVENT_DATE_TEXT, EVENT_TIME_TEXT y EVENT_PLACE_TEXT', async () => {
    const { service, sendSpy } = build();
    await service.resendAuthEmailOfType('a@b.co', 'VERIFICACION_EMAIL', 'tok');
    const params = sendSpy.mock.calls[0][3];
    const html = render('verification', params);
    expect(html).toContain('27 de noviembre');
    expect(html).toContain('9:00 am - 1:00 pm');
    expect(html).toContain('Auditorio de prueba');
    expect(html).not.toContain('28 de mayo');
    expect(html).not.toContain('Coliseo');
  });

  it('el certificado de jurado usa la fecha y el año de la edición activa', async () => {
    const { service, prisma, sendSpy } = build();
    await service.resendJurorCertEmail('u1');
    expect(
      (prisma.edition as { findFirst: jest.Mock }).findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    );
    const html = render('juror_certificate', sendSpy.mock.calls[0][3]);
    expect(html).toContain('27 de noviembre de 2031');
    expect(html).not.toContain('28 de mayo');
  });

  describe('correo de verificación degrada de forma segura', () => {
    const LINES: Record<string, string> = {
      EVENT_DATE_TEXT: '27 de noviembre',
      EVENT_TIME_TEXT: '9:00 am - 1:00 pm',
      EVENT_PLACE_TEXT: 'Auditorio de prueba',
    };

    it.each(Object.keys(LINES))(
      'sin %s envía el correo sin esa línea y registra el error',
      async (missing) => {
        const { service, sendSpy } = build({ ...ENV, [missing]: undefined });
        const errSpy = jest
          .spyOn(service['logger'], 'error')
          .mockImplementation(() => undefined);
        await service.resendAuthEmailOfType(
          'a@b.co',
          'VERIFICACION_EMAIL',
          'tok',
        );
        expect(sendSpy).toHaveBeenCalledTimes(1);
        const html = render('verification', sendSpy.mock.calls[0][3]);
        expect(html).not.toContain('undefined');
        expect(html).not.toContain('28 de mayo');
        expect(html).not.toContain('Coliseo');
        expect(html).not.toContain(LINES[missing]);
        for (const [name, value] of Object.entries(LINES)) {
          if (name !== missing) expect(html).toContain(value);
        }
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining(missing));
        expect(errSpy.mock.calls.flat().join(' ')).not.toContain('a@b.co');
      },
    );

    it('sin ninguna variable envía sin fecha, hora ni lugar', async () => {
      const { service, sendSpy } = build({});
      jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);
      await service.resendAuthEmailOfType(
        'a@b.co',
        'VERIFICACION_EMAIL',
        'tok',
      );
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const html = render('verification', sendSpy.mock.calls[0][3]);
      expect(html).not.toMatch(/undefined|28 de mayo|Coliseo/);
      expect(html).not.toContain('Fecha:');
      expect(html).not.toContain('Hora:');
      expect(html).not.toContain('Lugar:');
    });
  });

  it('onModuleInit avisa por log si falta alguna EVENT_* y no lanza', async () => {
    const { service, prisma } = build({ ...ENV, EVENT_TIME_TEXT: undefined });
    prisma.tokenType = {
      findUnique: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('EVENT_TIME_TEXT'),
    );
  });

  it('sin edición activa el certificado de jurado falla con mensaje claro', async () => {
    const { service, prisma, sendSpy } = build();
    (prisma.edition as { findFirst: jest.Mock }).findFirst.mockResolvedValue(
      null,
    );
    await expect(service.resendJurorCertEmail('u1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(sendSpy).not.toHaveBeenCalled();
    await expect(service['getEventDateWithYear']()).rejects.toThrow(
      /edición activa/,
    );
  });

  it('getEventInfo lanza un error claro si falta una variable', () => {
    const { service } = build({ ...ENV, EVENT_PLACE_TEXT: undefined });
    expect(() => service.getEventInfo()).toThrow(/EVENT_PLACE_TEXT/);
  });

  it('el certificado de jurado falla con mensaje de configuración faltante sin EVENT_DATE_TEXT', async () => {
    const { service, sendSpy } = build({ ...ENV, EVENT_DATE_TEXT: undefined });
    await expect(service.resendJurorCertEmail('u1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('el correo de videojuego aprobado usa EVENT_DATE_TEXT', async () => {
    const { service, prisma, sendSpy } = build();
    prisma.videogame = {
      findFirst: jest.fn().mockResolvedValue({ name: 'Juego' }),
    };
    await service.resendTeamEmailOfType('a@b.co', 'VIDEOGAME_APPROVED');
    const html = render('videogame_approved', sendSpy.mock.calls[0][3]);
    expect(html).toContain('27 de noviembre');
  });
});
