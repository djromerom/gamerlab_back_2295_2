import { NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { blobRefsPassthrough } from '../../upload/blob-reference.mock';

describe('TeamsService.findOne', () => {
  const repository = { findOne: jest.fn() };
  const service = new TeamsService(
    {} as any,
    repository as any,
    {} as any,
    {} as any,
    {} as any, // settingsService (ranking-y-datos-privados)
    blobRefsPassthrough(), // blobRefs (blob-referencia-back)
  );

  beforeEach(() => jest.resetAllMocks());

  it('responde 404 si el equipo no existe', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findOne(999999)).rejects.toThrow(NotFoundException);
  });

  it('devuelve el equipo si existe', async () => {
    repository.findOne.mockResolvedValue({ id: 3 });
    await expect(service.findOne(3)).resolves.toEqual({ id: 3 });
  });
});

describe('TeamsService.create — correo duplicado', () => {
  it('el mensaje sale en español', async () => {
    const repository = {
      checkEmailsExist: jest.fn().mockResolvedValue({ 'a@b.co': true }),
    };
    const recaptcha = { verify: jest.fn().mockResolvedValue(true) };
    const service = new TeamsService(
      {} as any,
      repository as any,
      recaptcha as any,
      {} as any,
      {} as any, // settingsService (ranking-y-datos-privados)
      blobRefsPassthrough(), // blobRefs (blob-referencia-back)
    );

    await expect(
      service.create({
        recaptchaToken: 't',
        members: [{ memberEmail: 'a@b.co' }],
        videogame: { vgName: 'Juego', logoUrl: 'https://x/logo.png' },
      } as any),
    ).rejects.toThrow('El correo a@b.co ya está en uso.');
  });
});
