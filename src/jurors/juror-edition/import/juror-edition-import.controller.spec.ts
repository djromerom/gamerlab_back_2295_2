import { BadRequestException, StreamableFile } from '@nestjs/common';
import { REQUIRED_SERVICE_KEY } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { JurorEditionImportController } from './juror-edition-import.controller';
import { JurorEditionImportService } from './juror-edition-import.service';

describe('JurorEditionImportController (HU-49)', () => {
  const service = { import: jest.fn() };
  const controller = new JurorEditionImportController(
    service as unknown as JurorEditionImportService,
  );
  const proto = JurorEditionImportController.prototype as unknown as Record<
    string,
    () => unknown
  >;

  beforeEach(() => jest.resetAllMocks());

  it('protege las rutas con RolePermissionGuard', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      JurorEditionImportController,
    ) as unknown[];
    expect(guards).toContain(RolePermissionGuard);
  });

  it.each(['template', 'import'])(
    '%s exige ManageEditionJurors (solo Administrador)',
    (handler) => {
      expect(Reflect.getMetadata(REQUIRED_SERVICE_KEY, proto[handler])).toBe(
        'ManageEditionJurors',
      );
    },
  );

  it('sin archivo responde 400 y no llama al servicio', () => {
    expect(() => controller.import(undefined, 'admin-1')).toThrow(
      BadRequestException,
    );
    expect(service.import).not.toHaveBeenCalled();
  });

  it('pasa el contenido del archivo y el id del administrador al servicio', () => {
    service.import.mockReturnValue({ ok: true });
    const file = { buffer: Buffer.from('xlsx') } as Express.Multer.File;
    expect(controller.import(file, 'admin-1')).toEqual({ ok: true });
    expect(service.import).toHaveBeenCalledWith(file.buffer, 'admin-1');
  });

  it('la plantilla se descarga como xlsx', async () => {
    const file = await controller.template();
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders()).toMatchObject({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="plantilla-jurados.xlsx"',
    });
  });
});
