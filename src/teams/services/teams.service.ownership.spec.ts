import { blobRefsPassthrough } from '../../upload/blob-reference.mock';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { ROLE_IDS } from '../../auth/constants/roles';

/**
 * BG-01 — Un estudiante tiene el permiso `UpdateTeam`, pero no cambia integrantes ajenos.
 * ARK-161 (BG-38): desde SP-05 agregar, quitar o cambiar el correo de un integrante lo hace solo
 * el administrador; el líder de su propio equipo también recibe 403.
 */
describe('TeamsService — propiedad del equipo en integrantes (BG-01)', () => {
  const repository = {
    findOne: jest.fn(),
    addMember: jest.fn(),
    deleteMember: jest.fn(),
  };
  const service = new TeamsService(
    {} as any,
    repository as any,
    {} as any,
    { team: { findUnique: async () => ({ edition: { status: 'ACTIVE', title: 'E5' } }) } } as any, // ARK-130: el equipo es de la edición activa
    {} as any,
    blobRefsPassthrough(),
    {} as any, // RankingService (HU-04)
  );

  const team = { id: 10, userId: 'leader-1' };
  const leader = { id: 'leader-1', roleId: ROLE_IDS.STUDENT } as any;
  const otherStudent = {
    id: 'otro-estudiante',
    roleId: ROLE_IDS.STUDENT,
  } as any;
  const admin = { id: 'admin-1', roleId: ROLE_IDS.ADMIN } as any;
  const memberDto = { memberFirstName: 'A', memberLastName: 'B' } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findOne.mockResolvedValue(team);
  });

  describe('addMember', () => {
    it('rechaza al líder aunque sea su equipo (BG-38)', async () => {
      await expect(service.addMember(10, memberDto, leader)).rejects.toThrow(
        /Solo el administrador puede cambiar los integrantes/,
      );
      expect(repository.addMember).not.toHaveBeenCalled();
    });

    it('permite al administrador agregar un integrante a cualquier equipo', async () => {
      await service.addMember(10, memberDto, admin);
      expect(repository.addMember).toHaveBeenCalledWith(10, memberDto);
    });

    it('rechaza a un estudiante que no es líder de ese equipo', async () => {
      await expect(
        service.addMember(10, memberDto, otherStudent),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.addMember).not.toHaveBeenCalled();
    });

    it('responde 404 si el equipo no existe', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.addMember(99, memberDto, admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteMember', () => {
    it('rechaza al líder aunque sea su equipo (BG-38)', async () => {
      await expect(service.deleteMember(10, 55, leader)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.deleteMember).not.toHaveBeenCalled();
    });

    it('permite al administrador eliminar un integrante de cualquier equipo', async () => {
      await service.deleteMember(10, 55, admin);
      expect(repository.deleteMember).toHaveBeenCalledWith(10, 55);
    });

    it('rechaza a un estudiante que no es líder de ese equipo', async () => {
      await expect(service.deleteMember(10, 55, otherStudent)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.deleteMember).not.toHaveBeenCalled();
    });
  });

  describe('updateMemberEmail (I2)', () => {
    it('responde 403 (no 401) a quien no es el líder: el front interpreta 401 como sesión vencida', async () => {
      await expect(
        service.updateMemberEmail(10, 55, { email: 'x@uninorte.edu.co' } as any, otherStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza también al líder: el correo lo cambia solo el administrador (BG-38)', async () => {
      await expect(
        service.updateMemberEmail(10, 55, { email: 'x@uninorte.edu.co' } as any, leader),
      ).rejects.toThrow(/Solo el administrador puede cambiar el correo de un integrante/);
    });
  });
});
