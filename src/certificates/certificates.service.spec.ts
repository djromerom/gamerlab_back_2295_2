import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

const EDITION = {
  id: 5,
  title: 'Edición de Prueba - Viernes',
  year: 2026,
  semester: 30,
  status: 'ACTIVE',
  startsAt: new Date('2026-11-27T02:00:00.000Z'), // 26/11 a las 9 p. m. en Colombia
};

function team(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    teamName: 'Los Pixeles',
    teamCode: 'N1-ABC-101',
    members: [{ firstName: 'Ana', lastName: 'Ruiz', email: 'ana@x.co' }],
    videogame: {
      name: 'Juego',
      isActive: true,
      videogameStatus: { status: 'CONFIRMADO' },
    },
    ...overrides,
  };
}

function build() {
  const prisma = {
    edition: { findFirst: jest.fn().mockResolvedValue(EDITION) },
    fairSchedule: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ fairDate: new Date('2026-11-26T00:00:00.000Z') }),
    },
    team: { findFirst: jest.fn().mockResolvedValue(team()) },
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue('http://gotenberg') };
  const service = new CertificatesService(prisma as never, config as never);
  jest
    .spyOn(service as never as { wait: () => Promise<void> }, 'wait')
    .mockResolvedValue(undefined);
  return { service, prisma };
}

const pdfResponse = () =>
  new Response(new Uint8Array([1, 2, 3]), { status: 200 });
const errorResponse = (status: number) =>
  new Response('error', { status, statusText: 'Error' });

describe('CertificatesService (ARK-170)', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(pdfResponse()));
  });
  afterEach(() => jest.restoreAllMocks());

  describe('qué equipos se certifican', () => {
    it('busca solo equipos activos de la edición activa y sus integrantes activos', async () => {
      const { service, prisma } = build();
      const result = await service.findCertifiableTeam({ userId: 'u1' });
      const args = prisma.team.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({
        userId: 'u1',
        editionId: 5,
        isActive: true,
      });
      expect(args.include.members.where).toEqual({ isActive: true });
      expect(result).toMatchObject({
        fairName: 'VI Feria Gamer',
        eventDate: '26 de noviembre de 2026',
        memberNames: ['Ana Ruiz'],
      });
    });

    it('un equipo fuera de la edición activa da 404', async () => {
      const { service, prisma } = build();
      prisma.team.findFirst.mockResolvedValue(null);
      await expect(
        service.findCertifiableTeam({ id: 10 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['PENDIENTE', 'RECHAZADO'])(
      'un equipo %s no se certifica',
      async (status) => {
        const { service, prisma } = build();
        prisma.team.findFirst.mockResolvedValue(
          team({
            videogame: {
              name: 'J',
              isActive: true,
              videogameStatus: { status },
            },
          }),
        );
        await expect(
          service.findCertifiableTeam({ id: 10 }),
        ).rejects.toMatchObject({
          response: { code: 'CERTIFICATE_TEAM_NOT_CONFIRMED' },
        });
      },
    );

    it('un equipo sin juego no se certifica', async () => {
      const { service, prisma } = build();
      prisma.team.findFirst.mockResolvedValue(team({ videogame: null }));
      await expect(
        service.findCertifiableTeam({ id: 10 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un equipo no calificable no recibe el de participación (HU-39)', async () => {
      const { service, prisma } = build();
      prisma.team.findFirst.mockResolvedValue(team({ notGradable: true }));
      await expect(
        service.findCertifiableTeam({ id: 10 }),
      ).rejects.toMatchObject({
        response: { code: 'CERTIFICATE_TEAM_NOT_GRADABLE' },
      });
    });

    it('el de presentador externo es solo para equipos no calificables (HU-39)', async () => {
      const { service, prisma } = build();
      await expect(
        service.findCertifiableTeam({ id: 10 }, 'presenter'),
      ).rejects.toMatchObject({
        response: { code: 'CERTIFICATE_TEAM_GRADABLE' },
      });
      prisma.team.findFirst.mockResolvedValue(team({ notGradable: true }));
      await expect(
        service.findCertifiableTeam({ id: 10 }, 'presenter'),
      ).resolves.toMatchObject({
        gameName: 'Juego',
        memberNames: ['Ana Ruiz'],
      });
    });

    it('un equipo sin integrantes activos no se certifica', async () => {
      const { service, prisma } = build();
      prisma.team.findFirst.mockResolvedValue(team({ members: [] }));
      await expect(
        service.findCertifiableTeam({ id: 10 }),
      ).rejects.toMatchObject({
        response: { code: 'CERTIFICATE_TEAM_WITHOUT_MEMBERS' },
      });
    });
  });

  describe('contenido del PDF', () => {
    const sentHtml = async () => {
      const form = fetchMock.mock.calls[0][1].body as FormData;
      return (form.get('files') as Blob).text();
    };

    /** El HTML sin fuentes ni imágenes incrustadas (en base64 puede haber cualquier cosa). */
    const textOf = (html: string) => html.replace(/data:[^)"']+/g, 'data:');

    it.each([
      [0, 'Por su participación en la VI Feria Gamer con su videojuego Juego'],
      [1, 'En la VI Feria Gamer, con su videojuego Juego'],
      [2, 'En la VI Feria Gamer, con su videojuego Juego'],
      [3, 'En la VI Feria Gamer, con su videojuego Juego'],
    ])(
      'el diploma del puesto %s usa edición y fecha reales',
      async (place, line) => {
        const { service } = build();
        const data = await service.findCertifiableTeam({ id: 10 });
        await service.generateTeamCertificatePdf(data, place);
        const html = textOf(await sentHtml());
        expect(html).toContain(line);
        expect(html).toContain('Barranquilla, 26 de noviembre de 2026');
        expect(html).not.toContain('Edición de Prueba');
        expect(html).toContain('Los Pixeles');
        // ARK-256: ninguna fecha numérica
        expect(html).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
      },
    );

    it('el podio lleva medalla y la participación no', async () => {
      const { service } = build();
      const data = await service.findCertifiableTeam({ id: 10 });
      await service.generateTeamCertificatePdf(data, 1);
      expect(await sentHtml()).toContain('alt="Medalla de oro"');
      fetchMock.mockClear();
      await service.generateTeamCertificatePdf(data, 0);
      expect(await sentHtml()).not.toContain('class="medal"');
    });

    it('sin fecha de feria el diploma dice solo Barranquilla', async () => {
      const { service } = build();
      const data = await service.findCertifiableTeam({ id: 10 });
      await service.generateTeamCertificatePdf({ ...data, eventDate: '' }, 1);
      const html = textOf(await sentHtml());
      expect(html).toContain('<div class="date">Barranquilla</div>');
      expect(html).not.toContain('Barranquilla,');
    });

    it('el diploma de jurado usa edición y fecha reales', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        firstName: 'Ana',
        lastName: 'Ruiz',
      });
      await service.generateJurorCertificateHtml('u1');
      const html = textOf(await sentHtml());
      expect(html).toContain('Participó como jurado en la VI Feria Gamer');
      expect(html).toContain('Ana Ruiz');
      expect(html).toContain('Barranquilla, 26 de noviembre de 2026');
      expect(html).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
      expect(html).not.toContain('Edición de Prueba');
    });

    it('el diploma de presentador externo usa la misma plantilla', async () => {
      const { service } = build();
      await service.generateExternalPresenterCertificatePdf({
        presenterName: 'Carlos Vega',
        organization: 'Estudio',
        presentationTitle: 'Charla',
        editionTitle: 'VI Feria Gamer',
        placeAndDate: 'Barranquilla, 26 de noviembre de 2026',
      });
      const html = textOf(await sentHtml());
      expect(html).toContain('data-t="externo"');
      expect(html).toContain(
        'Asistió como presentador externo a la VI Feria Gamer',
      );
      expect(html).toContain('Con la presentación Charla');
    });

    it('sin fecha en el cronograma usa el día de inicio de la edición en Colombia', async () => {
      const { service, prisma } = build();
      prisma.fairSchedule.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        firstName: 'Ana',
        lastName: 'Ruiz',
      });
      await service.generateJurorCertificateHtml('u1');
      expect(await sentHtml()).toContain(
        'Barranquilla, 26 de noviembre de 2026',
      );
    });

    it('los diplomas se imprimen con el tamaño del CSS y esperan a que el texto se ajuste', async () => {
      const { service } = build();
      const data = await service.findCertifiableTeam({ id: 10 });
      await service.generateTeamCertificatePdf(data, 0);
      const form = fetchMock.mock.calls[0][1].body as FormData;
      expect(form.get('preferCssPageSize')).toBe('true');
      expect(form.get('printBackground')).toBe('true');
      expect(form.get('waitForExpression')).toBe(
        'window.diplomaReady === true',
      );
    });

    it('ya no pide una espera fija a Gotenberg y otros HTML no esperan al diploma', async () => {
      const { service } = build();
      await service.convertHtmlToPdf('<p>x</p>');
      const form = fetchMock.mock.calls[0][1].body as FormData;
      expect(form.get('waitDelay')).toBeNull();
      expect(form.get('skipNetworkIdleEvent')).toBe('false');
      // Sin opciones de página, los certificados siguen como antes
      expect(form.get('paperWidth')).toBeNull();
      expect(form.get('marginTop')).toBeNull();
      // Las escarapelas nunca avisan con `diplomaReady`: no deben quedarse esperándolo
      expect(form.get('waitForExpression')).toBeNull();
      expect(form.get('preferCssPageSize')).toBeNull();
    });

    it('envía el tamaño de página y los márgenes cuando se piden', async () => {
      const { service } = build();
      await service.convertHtmlToPdf('<p>x</p>', {
        paperWidth: '11in',
        paperHeight: '17in',
        margin: '0',
      });
      const form = fetchMock.mock.calls[0][1].body as FormData;
      expect(form.get('paperWidth')).toBe('11in');
      expect(form.get('paperHeight')).toBe('17in');
      for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
        expect(form.get(`margin${side}`)).toBe('0');
      }
    });
  });

  describe('volumen hacia Gotenberg', () => {
    it('reintenta ante un 503 y entrega el PDF', async () => {
      const { service } = build();
      fetchMock
        .mockResolvedValueOnce(errorResponse(503))
        .mockResolvedValueOnce(pdfResponse());
      await expect(service.convertHtmlToPdf('x')).resolves.toBeInstanceOf(
        Buffer,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reintenta ante un error de red', async () => {
      const { service } = build();
      fetchMock
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(pdfResponse());
      await expect(service.convertHtmlToPdf('x')).resolves.toBeInstanceOf(
        Buffer,
      );
    });

    it('se rinde al tercer intento', async () => {
      const { service } = build();
      fetchMock.mockImplementation(() => Promise.resolve(errorResponse(503)));
      await expect(service.convertHtmlToPdf('x')).rejects.toThrow(
        /Gotenberg PDF generation failed: 503/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('no reintenta un error que no es de saturación', async () => {
      const { service } = build();
      fetchMock.mockResolvedValue(errorResponse(400));
      await expect(service.convertHtmlToPdf('x')).rejects.toThrow(/400/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('no pide más de 3 PDF a la vez aunque lleguen 30', async () => {
      const { service } = build();
      let running = 0;
      let peak = 0;
      fetchMock.mockImplementation(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setImmediate(resolve));
        running--;
        return pdfResponse();
      });
      await Promise.all(
        Array.from({ length: 30 }, () => service.convertHtmlToPdf('x')),
      );
      expect(peak).toBe(3);
      expect(fetchMock).toHaveBeenCalledTimes(30);
    });
  });

  describe('descargas', () => {
    it('el equipo aplica las reglas y nombra el archivo por tipo', async () => {
      const { service } = build();
      const result = await service.downloadTeamCertificate(
        10,
        '1ST_PLACE_CERTIFICATE',
      );
      expect(result.fileName).toBe('certificado-primer-puesto-N1-ABC-101.pdf');
      expect(result.pdf).toBeInstanceOf(Buffer);
    });

    it('un jurado que no participa en la edición no se descarga', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        firstName: 'Ana',
        lastName: 'Ruiz',
      });
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.downloadJurorCertificate('u1')).rejects.toThrow(
        /no participa/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('un jurado inexistente da 404', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.downloadJurorCertificate('u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
