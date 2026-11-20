import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { REQUIRED_SERVICE_KEY } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { ROLE_IDS } from '../auth/constants/roles';
import { AppUser } from '../auth/jwt.strategy';
import { ReportsController } from './reports.controller';

/**
 * BG-67 (ARK-268): videojuegoData, NRCData y DatosGraficoMateria traen integrantes, notas,
 * promedios junior/senior y el promedio por NRC. Dejan de ser públicas: exigen sesión,
 * RolePermissionGuard y ExportAdminReports (solo Administrador). materiaData sigue pública.
 */
describe('ReportsController — rutas de notas solo para el Administrador (BG-67)', () => {
  const handler = (name: keyof ReportsController) =>
    ReportsController.prototype[name] as unknown as object;

  it.each([
    'getWithMateriaYNRC',
    'getNrcWithSubjectNameAndAverage',
    'getAverageScorePerSubject',
  ] as const)('%s no es pública y exige ExportAdminReports', (name) => {
    const fn = handler(name);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, fn)).toBeUndefined();
    expect(Reflect.getMetadata(REQUIRED_SERVICE_KEY, fn)).toBe(
      'ExportAdminReports',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, fn)).toContain(
      RolePermissionGuard,
    );
  });

  it('materiaData sigue pública (solo nombres de materias)', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler('getSubjects'))).toBe(
      true,
    );
  });

  it('videojuegoData llega al servicio con el usuario y sin caché pública', async () => {
    const reports = {
      getVideogamesData: jest.fn().mockResolvedValue([{ id: 1, promedio: 5 }]),
    };
    const controller = new ReportsController(reports as any);
    const admin = { id: 'a', roleId: ROLE_IDS.ADMIN } as AppUser;
    await expect(controller.getWithMateriaYNRC(admin)).resolves.toEqual([
      { id: 1, promedio: 5 },
    ]);
    expect(reports.getVideogamesData).toHaveBeenCalledWith(admin, undefined);
  });
});
