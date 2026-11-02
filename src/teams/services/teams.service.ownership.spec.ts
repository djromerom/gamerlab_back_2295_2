import { blobRefsPassthrough } from '../../upload/blob-reference.mock';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { ROLE_IDS } from '../../auth/constants/roles';

/**
 * BG-01 — Un estudiante tiene el permiso `UpdateTeam`, pero solo puede agregar o
 * quitar integrantes de SU equipo. El administrador puede hacerlo en cualquiera.
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
    {} as any,
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
    it('permite al líder agregar un integrante a su equipo', async () => {
      await service.addMember(10, memberDto, leader);
      expect(repository.addMember).toHaveBeenCalledWith(10, memberDto);
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
    it('permite al líder eliminar un integrante de su equipo', async () => {
      await service.deleteMember(10, 55, leader);
      expect(repository.deleteMember).toHaveBeenCalledWith(10, 55);
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
        service.updateMemberEmail(10, 55, { email: 'x@uninorte.edu.co' } as any, 'otro-estudiante'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
