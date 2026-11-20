import { NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';

// HU-50 (ARK-314): «Exigir código de verificación a los jurados» en Configuración del evento.
describe('SettingsService: código de verificación global (HU-50)', () => {
  const allison = { id: 'admin-1', firstName: 'Allison', lastName: 'Ruiz' };

  const make = (config: Record<string, unknown> | null) => {
    const prisma = {
      eventConfiguration: {
        findFirst: jest.fn().mockResolvedValue(config),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              verificationCodesEnabled: data.verificationCodesEnabled,
              verificationCodesChangedAt: data.verificationCodesChangedAt,
              verificationCodesChangedBy: data.verificationCodesChangedBy,
            }),
          ),
      },
      user: { findUnique: jest.fn().mockResolvedValue(allison) },
    };
    return { svc: new SettingsService(prisma as never), prisma };
  };

  it('sin configuración de la edición activa se exige (no lanza)', async () => {
    const { svc } = make(null);
    await expect(svc.getVerificationCodes()).resolves.toEqual({
      verificationCodesEnabled: true,
      changedAt: null,
      changedBy: null,
    });
  });

  it('apagarlo guarda quién y cuándo, y devuelve el nombre de quien lo cambió', async () => {
    const { svc, prisma } = make({ id: 3, verificationCodesEnabled: true });

    const result = await svc.setVerificationCodes(false, 'admin-1');

    const { data } = (
      prisma.eventConfiguration.update.mock.calls[0] as [
        { where: unknown; data: Record<string, unknown> },
      ]
    )[0];
    expect(data.verificationCodesEnabled).toBe(false);
    expect(data.verificationCodesChangedBy).toBe('admin-1');
    expect(data.verificationCodesChangedAt).toBeInstanceOf(Date);
    expect(result).toEqual({
      verificationCodesEnabled: false,
      changedAt: data.verificationCodesChangedAt,
      changedBy: { id: 'admin-1', name: 'Allison Ruiz' },
    });
  });

  it('repetir el mismo valor no lo vuelve a registrar', async () => {
    const changedAt = new Date('2026-11-26T15:00:00Z');
    const { svc, prisma } = make({
      id: 3,
      verificationCodesEnabled: false,
      verificationCodesChangedAt: changedAt,
      verificationCodesChangedBy: 'admin-1',
    });

    await expect(svc.setVerificationCodes(false, 'admin-2')).resolves.toEqual({
      verificationCodesEnabled: false,
      changedAt,
      changedBy: { id: 'admin-1', name: 'Allison Ruiz' },
    });
    expect(prisma.eventConfiguration.update).not.toHaveBeenCalled();
  });

  it('cambiarlo sin configuración de la edición activa responde 404', async () => {
    const { svc } = make(null);
    await expect(
      svc.setVerificationCodes(false, 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
