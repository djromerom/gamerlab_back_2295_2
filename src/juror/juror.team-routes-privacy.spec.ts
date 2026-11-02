import { JurorController } from './juror.controller';
import { JurorService } from './juror.service';
import { ROLE_IDS } from '../auth/constants/roles';

/**
 * ARK-110 — `GET /juror/teams/:teamId/jurors-status` y `.../evaluation-stats`.
 * El permiso por rol lo cubre `src/auth/route-access.spec.ts` (ListJurors: solo
 * Administrador; ViewTeamEvaluationStats: Estudiante, Profesor y Jurado). Aquí se
 * prueba qué datos de los jurados recibe cada rol.
 */
describe('Rutas de jurados por equipo: correo según el rol (ARK-110)', () => {
  const team = {
    id: 7,
    teamName: 'Los Pixel',
    videogame: { id: 70, name: 'Juego' },
    assignedJurors: [
      { id: 'j1', firstName: 'Ana', lastName: 'Ruiz', email: 'ana@uni.edu' },
      { id: 'j2', firstName: 'Luis', lastName: 'Gil', email: 'luis@uni.edu' },
    ],
  };

  const prisma = {
    team: { findUnique: jest.fn() },
    evaluation: { findMany: jest.fn(), count: jest.fn() },
  };
  const service = new JurorService({} as any, prisma as any, {} as any);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.team.findUnique.mockResolvedValue(team);
    prisma.evaluation.findMany.mockResolvedValue([{ jurorId: 'j1' }]);
    prisma.evaluation.count.mockResolvedValue(1);
  });

  describe('JurorService.getTeamJurorsEvaluationStatus', () => {
    it('con includeEmail incluye el correo de cada jurado', async () => {
      const result = await service.getTeamJurorsEvaluationStatus(7, true);
      expect(result.jurados).toEqual([
        {
          id: 'j1',
          nombre: 'Ana Ruiz',
          email: 'ana@uni.edu',
          yaCalifico: true,
          estadoEvaluacion: 'CALIFICADO',
        },
        {
          id: 'j2',
          nombre: 'Luis Gil',
          email: 'luis@uni.edu',
          yaCalifico: false,
          estadoEvaluacion: 'PENDIENTE',
        },
      ]);
    });

    it('por defecto no incluye correos', async () => {
      const result = await service.getTeamJurorsEvaluationStatus(7);
      expect(JSON.stringify(result)).not.toContain('@');
      expect(result.jurados[0]).toEqual({
        id: 'j1',
        nombre: 'Ana Ruiz',
        yaCalifico: true,
        estadoEvaluacion: 'CALIFICADO',
      });
    });

    it('sin videojuego: todos pendientes y sin correos', async () => {
      prisma.team.findUnique.mockResolvedValue({ ...team, videogame: null });
      const result = await service.getTeamJurorsEvaluationStatus(7);
      expect(result.equipo.videojuego).toBeNull();
      expect(result.jurados.map((j: any) => j.estadoEvaluacion)).toEqual([
        'PENDIENTE',
        'PENDIENTE',
      ]);
      expect(JSON.stringify(result)).not.toContain('@');
    });
  });

  describe('JurorService.getTeamEvaluationStats', () => {
    it('solo devuelve conteos, sin datos de los jurados', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 7,
        videogame: { id: 70 },
        assignedJurors: [{ id: 'j1' }, { id: 'j2' }],
      });
      await expect(service.getTeamEvaluationStats(7)).resolves.toEqual({
        totalJurorsAssigned: 2,
        jurorsWhoEvaluated: 1,
      });
    });
  });

  describe('JurorController.getTeamJurorsEvaluationStatus', () => {
    const jurorService = {
      getTeamJurorsEvaluationStatus: jest.fn().mockResolvedValue({}),
    };
    const controller = new JurorController(
      jurorService as any,
      {} as any,
      {} as any,
    );

    it.each([
      ['Administrador', ROLE_IDS.ADMIN, true],
      ['Profesor', ROLE_IDS.PROFESSOR, false],
      ['Jurado', ROLE_IDS.JUROR, false],
      ['Estudiante', ROLE_IDS.STUDENT, false],
      ['Staff', 5, false],
    ])('%s: includeEmail = %s', async (_rol, roleId, includeEmail) => {
      jurorService.getTeamJurorsEvaluationStatus.mockClear();
      await controller.getTeamJurorsEvaluationStatus('7', {
        id: 'u',
        roleId,
      } as any);
      expect(jurorService.getTeamJurorsEvaluationStatus).toHaveBeenCalledWith(
        7,
        includeEmail,
      );
    });
  });
});
