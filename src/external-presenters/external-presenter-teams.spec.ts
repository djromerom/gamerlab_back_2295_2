import { ExternalPresenterCertificatesService } from './external-presenter-certificates.service';
import { buildExternalPresentersWorkbook } from './external-presenters-export';

/** HU-39 (ARK-209): el presentador externo que es un equipo. */
describe('Equipos presentadores externos', () => {
  const EDITION = {
    id: 4,
    title: 'Feria 2026-30',
    year: 2026,
    semester: 30,
    status: 'ACTIVE',
    startsAt: new Date('2026-11-26T05:00:00.000Z'),
  };
  const TEAM = {
    id: 10,
    teamName: 'Los Pixeles',
    teamCode: 'N1-ABC-101',
    gameName: 'Pixel Quest',
    memberNames: ['Ana Ruiz', 'Luis Díaz'],
    memberEmails: ['ana@prueba.invalid', 'luis@prueba.invalid'],
    fairName: 'VI Feria Gamer',
    eventDate: '26/11/2026',
  };

  const setup = () => {
    const prisma = {
      edition: { findFirst: jest.fn().mockResolvedValue(EDITION) },
      fairSchedule: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            fairDate: new Date('2026-11-26T00:00:00.000Z'),
          }),
      },
      team: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const certificates = {
      findCertifiableTeam: jest.fn().mockResolvedValue(TEAM),
      generateExternalPresenterCertificatePdf: jest
        .fn()
        .mockResolvedValue(Buffer.from('pdf')),
    };
    const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const presenters = { rowsOf: jest.fn().mockResolvedValue([]) };
    const service = new ExternalPresenterCertificatesService(
      prisma as never,
      presenters as never,
      certificates as never,
      email as never,
    );
    return { service, prisma, certificates, email };
  };

  it('un certificado por equipo, con el título del proyecto, que llega a cada integrante', async () => {
    const { service, certificates, email } = setup();

    const result = await service.sendTeam(10);

    expect(certificates.findCertifiableTeam).toHaveBeenCalledWith(
      { id: 10 },
      'presenter',
    );
    expect(
      certificates.generateExternalPresenterCertificatePdf,
    ).toHaveBeenCalledTimes(1);
    expect(
      certificates.generateExternalPresenterCertificatePdf,
    ).toHaveBeenCalledWith({
      presenterName: 'Ana Ruiz y Luis Díaz',
      organization: 'Equipo Los Pixeles',
      presentationTitle: 'Pixel Quest',
      editionTitle: 'VI Feria Gamer',
      placeAndDate: 'Barranquilla, 26 de noviembre de 2026',
    });
    expect(email.sendEmail).toHaveBeenCalledTimes(2);
    expect(email.sendEmail.mock.calls.map((c) => c[0])).toEqual(
      TEAM.memberEmails,
    );
    expect(email.sendEmail.mock.calls[1][2]).toBe(
      'external_presenter_certificate',
    );
    expect(email.sendEmail.mock.calls[1][3]).toMatchObject({
      presenterName: 'Luis Díaz',
    });
    expect(result).toEqual({
      teamId: 10,
      sentTo: TEAM.memberEmails,
      failed: [],
    });
  });

  it('si falla un correo, los demás se envían y se informa', async () => {
    const { service, email } = setup();
    email.sendEmail.mockRejectedValueOnce(new Error('ACS caído'));
    const result = await service.sendTeam(10);
    expect(result.sentTo).toEqual(['luis@prueba.invalid']);
    expect(result.failed).toEqual([
      { email: 'ana@prueba.invalid', error: 'ACS caído' },
    ]);
  });

  it('si no llega a nadie, falla', async () => {
    const { service, email } = setup();
    email.sendEmail.mockRejectedValue(new Error('ACS caído'));
    await expect(service.sendTeam(10)).rejects.toThrow('ningún integrante');
  });

  it('enviar a todos incluye a los equipos presentadores', async () => {
    const { service, prisma, email } = setup();
    prisma.team.findMany.mockResolvedValue([
      {
        id: 10,
        teamCode: 'N1-ABC-101',
        teamName: 'Los Pixeles',
        videogame: null,
        members: [],
      },
    ]);
    const result = await service.sendAll();
    expect(prisma.team.findMany.mock.calls[0][0].where).toEqual({
      editionId: 4,
      isActive: true,
      notGradable: true,
    });
    expect(email.sendEmail).toHaveBeenCalledTimes(2);
    expect(result.teams).toEqual({ sent: 1, failed: [] });
    expect(result.message).toContain('1 de 1 equipos');
  });

  it('el Excel trae una hoja de equipos presentadores, una fila por integrante', () => {
    const workbook = buildExternalPresentersWorkbook([], 'Feria', [
      {
        id: 10,
        teamCode: 'N1-ABC-101',
        teamName: 'Los Pixeles',
        projectTitle: 'Pixel Quest',
        members: [
          { firstName: 'Ana', lastName: 'Ruiz', email: 'ana@prueba.invalid' },
          { firstName: 'Luis', lastName: 'Díaz', email: 'luis@prueba.invalid' },
        ],
      },
    ]);
    const sheet = workbook.getWorksheet('Equipos presentadores')!;
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(2).getCell('projectTitle').value).toBe('Pixel Quest');
    expect(sheet.getRow(3).getCell('email').value).toBe('luis@prueba.invalid');
  });
});
