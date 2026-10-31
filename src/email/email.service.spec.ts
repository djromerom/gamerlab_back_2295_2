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

  it.each(['EVENT_DATE_TEXT', 'EVENT_TIME_TEXT', 'EVENT_PLACE_TEXT'])(
    'sin %s falla con un mensaje claro y no envía con valor fijo',
    async (missing) => {
      const { service, sendSpy } = build({ ...ENV, [missing]: undefined });
      let error: unknown;
      try {
        service.getEventInfo();
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect((error as Error).message).toContain(missing);
      expect((error as Error).message).not.toContain('28 de mayo');

      await expect(
        service.resendAuthEmailOfType('a@b.co', 'VERIFICACION_EMAIL', 'tok'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(sendSpy).not.toHaveBeenCalled();
    },
  );

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
