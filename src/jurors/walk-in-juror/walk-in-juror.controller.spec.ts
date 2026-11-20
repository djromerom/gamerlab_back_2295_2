import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SERVICE_KEY } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { AssignWalkInTeamsDto } from './dto/assign-walk-in-teams.dto';
import { CreateWalkInJurorDto } from './dto/create-walk-in-juror.dto';
import { WalkInJurorController } from './walk-in-juror.controller';

const ADMIN_ID = 'admin-1';
const JUROR_ID = 'sub-1';

describe('WalkInJurorController (HU-24)', () => {
  it('exige el guard y el servicio ManageWalkInJurors', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WalkInJurorController);
    expect(guards).toContain(RolePermissionGuard);
    expect(
      new Reflector().get(REQUIRED_SERVICE_KEY, WalkInJurorController),
    ).toBe('ManageWalkInJurors');
  });

  it('pasa al servicio el cuerpo y el id del administrador', async () => {
    const service = { create: jest.fn().mockResolvedValue('ok') };
    const controller = new WalkInJurorController(service as any, {} as any);
    const body = { firstName: 'Laura' } as CreateWalkInJurorDto;

    await expect(controller.create(body, 'admin-1')).resolves.toBe('ok');
    expect(service.create).toHaveBeenCalledWith(body, 'admin-1');
  });
});

describe('WalkInJurorController · asignación (HU-24)', () => {
  it('pasa jurado, tope, grupos y administrador al servicio', async () => {
    const assignments = {
      suggest: jest.fn().mockResolvedValue('propuesta'),
      assign: jest.fn().mockResolvedValue('asignado'),
    };
    const controller = new WalkInJurorController({} as any, assignments as any);
    const body = { teamIds: [1] } as AssignWalkInTeamsDto;

    await expect(controller.suggest(JUROR_ID, { maxTeams: 2 })).resolves.toBe(
      'propuesta',
    );
    await expect(controller.assign(JUROR_ID, body, ADMIN_ID)).resolves.toBe(
      'asignado',
    );
    expect(assignments.suggest).toHaveBeenCalledWith(JUROR_ID, 2);
    expect(assignments.assign).toHaveBeenCalledWith(JUROR_ID, body, ADMIN_ID);
  });
});
