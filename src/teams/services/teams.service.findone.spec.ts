import { NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';

describe('TeamsService.findOne', () => {
  const repository = { findOne: jest.fn() };
  const service = new TeamsService(
    {} as any,
    repository as any,
    {} as any,
    {} as any,
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
