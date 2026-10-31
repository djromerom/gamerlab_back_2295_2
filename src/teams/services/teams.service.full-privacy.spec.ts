import { ForbiddenException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { ROLE_IDS } from '../../auth/constants/roles';
import { blobRefsPassthrough } from '../../upload/blob-reference.mock';

/**
 * F1/BG-07 — `GET /teams/:id/full` expone correos y códigos estudiantiles de los
 * integrantes. Un estudiante solo puede verlo si es líder o integrante del equipo.
 */
describe('TeamsService.findOneWithDetails — privacidad (F1/BG-07)', () => {
  const repository = {
    findOneWithDetails: jest.fn(),
    findOneWithDetailsByLeaderId: jest.fn(),
  };
  const service = new TeamsService(
    {} as any,
    repository as any,
    {} as any,
    {} as any,
    {} as any, // settingsService (ranking-y-datos-privados)
    blobRefsPassthrough(), // blobRefs (blob-referencia-back)
  );

  const team = {
    id: 10,
    userId: 'leader-1',
    members: [
      { id: 1, email: 'Integrante@uni.edu', studentCode: '1' },
      { id: 2, email: 'otro@uni.edu', studentCode: '2' },
    ],
  };
  const student = (id: string, email: string) =>
    ({ id, email, roleId: ROLE_IDS.STUDENT }) as any;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findOneWithDetailsByLeaderId.mockResolvedValue(null);
    repository.findOneWithDetails.mockResolvedValue(team);
  });

  it('rechaza a un estudiante de otro equipo', async () => {
    await expect(
      service.findOneWithDetails('10', student('x', 'x@uni.edu')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('permite al líder', async () => {
    await expect(
      service.findOneWithDetails('10', student('leader-1', 'l@uni.edu')),
    ).resolves.toBe(team);
  });

  it('permite a un integrante (correo sin distinguir mayúsculas)', async () => {
    await expect(
      service.findOneWithDetails('10', student('m', 'integrante@UNI.edu')),
    ).resolves.toBe(team);
  });

  it('permite al administrador', async () => {
    const admin = { id: 'a', email: 'a@uni.edu', roleId: ROLE_IDS.ADMIN } as any;
    await expect(service.findOneWithDetails('10', admin)).resolves.toBe(team);
  });

  it('no altera a profesor/jurado (siguen según RolePermissionGuard)', async () => {
    const prof = { id: 'p', email: 'p@uni.edu', roleId: ROLE_IDS.PROFESSOR } as any;
    await expect(service.findOneWithDetails('10', prof)).resolves.toBe(team);
  });
});
