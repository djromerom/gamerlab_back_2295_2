import { NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';

describe('SettingsService inscripciones', () => {
  const make = (config: unknown) => {
    const prisma = {
      eventConfiguration: {
        findFirst: jest.fn().mockResolvedValue(config),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ registrationsOpen: data.registrationsOpen })),
      },
    };
    return { svc: new SettingsService(prisma as never), prisma };
  };

  it('lee registrationsOpen de la edición activa', async () => {
    const { svc } = make({ id: 3, registrationsOpen: true });
    await expect(svc.getRegistrationsOpen()).resolves.toEqual({ registrationsOpen: true });
  });

  it('sin configuración activa se considera cerrada (no lanza)', async () => {
    const { svc } = make(null);
    await expect(svc.getRegistrationsOpen()).resolves.toEqual({ registrationsOpen: false });
  });

  it('actualiza el ajuste', async () => {
    const { svc, prisma } = make({ id: 3, registrationsOpen: false });
    await expect(svc.setRegistrationsOpen(true)).resolves.toEqual({ registrationsOpen: true });
    expect(prisma.eventConfiguration.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3 }, data: { registrationsOpen: true } }),
    );
  });

  it('actualizar sin configuración activa -> 404', async () => {
    const { svc } = make(null);
    await expect(svc.setRegistrationsOpen(true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza valor no booleano', async () => {
    const { svc } = make({ id: 3 });
    await expect(svc.setRegistrationsOpen(undefined as never)).rejects.toThrow();
  });
});
