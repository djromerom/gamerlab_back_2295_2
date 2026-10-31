import { blobRefsProvider } from '../upload/blob-reference.mock';
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrismaService = {
    team: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    videogame: { findMany: jest.fn() },
    teamFinalScore: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        blobRefsProvider, 
        { 
          provide: PrismaService, 
          useValue: mockPrismaService 
        },
        {
          provide: SettingsService,
          // isRankingVisible: ranking-y-datos-privados / promedios-ocultos
          useValue: { getShowRanking: jest.fn(), isRankingVisible: jest.fn().mockResolvedValue(true) },
        }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getJuradosDataForTeamLeader (BG-02)', () => {
    const team = { id: 7, videogame: { id: 70, name: 'Mi Juego', isActive: true } };
    const jurado = (id: string, evaluated: boolean) => ({
      id,
      firstName: 'Jurado',
      lastName: id,
      email: `${id}@example.com`,
      isActive: true,
      confirmationStatus: { status: 'CONFIRMADO' },
      evaluationsSubmitted: evaluated ? [{ id: 1 }] : [],
    });

    afterEach(() => jest.clearAllMocks());

    it('devuelve los jurados asignados al equipo del usuario, buscando por id', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue(team);
      mockPrismaService.user.findMany.mockResolvedValue([jurado('j1', true), jurado('j2', false)]);

      const result = await service.getJuradosDataForTeamLeader('student-1');

      expect(mockPrismaService.team.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'student-1', isActive: true } }),
      );
      const query = mockPrismaService.user.findMany.mock.calls[0][0];
      expect(query.where.teamsToEvaluate).toEqual({ some: { id: 7 } });
      expect(query.select.evaluationsSubmitted.where).toEqual({ isActive: true, videogameId: 70 });
      expect(result).toEqual([
        { id: 'j1', nombre: 'Jurado j1', correo: 'j1@example.com', estado: 'CONFIRMADO', videojuegosAsignados: ['Mi Juego'], videojuegosCompletos: ['Mi Juego'] },
        { id: 'j2', nombre: 'Jurado j2', correo: 'j2@example.com', estado: 'CONFIRMADO', videojuegosAsignados: ['Mi Juego'], videojuegosCompletos: [] },
      ]);
    });

    it('no usa el nombre del juego, así que otro juego con el mismo nombre no se mezcla', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue(team);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.getJuradosDataForTeamLeader('student-1');

      expect(JSON.stringify(mockPrismaService.user.findMany.mock.calls[0][0])).not.toContain('Mi Juego');
    });

    it('devuelve una lista vacía si el usuario no lidera un equipo con videojuego activo', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue(null);
      await expect(service.getJuradosDataForTeamLeader('profesor-1')).resolves.toEqual([]);

      mockPrismaService.team.findFirst.mockResolvedValue({ id: 7, videogame: { id: 70, name: 'X', isActive: false } });
      await expect(service.getJuradosDataForTeamLeader('student-1')).resolves.toEqual([]);

      expect(mockPrismaService.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getVideogamesData - progreso (ARK-SP1)', () => {
    const vg = (jurors: { id: string }[]) => ({
      id: 1, name: 'Juego', logoUrl: null,
      team: { teamCode: 'N1-01', teamName: 'E', members: [], assignedJurors: jurors, isExternal: false },
      evaluations: [], videogameStatus: null,
    });

    afterEach(() => jest.clearAllMocks());

    it('totalJuradosAsignados no cuenta desactivados y las notas de desasignados no suman', async () => {
      mockPrismaService.videogame.findMany.mockResolvedValue([vg([{ id: 'j1' }, { id: 'j2' }])]);
      mockPrismaService.teamFinalScore.findMany.mockResolvedValue([]);
      mockPrismaService.evaluation.findMany.mockResolvedValue([
        { videogameId: 1, jurorId: 'j1', isSenior: false, totalScore: 4 },
        { videogameId: 1, jurorId: 'fuera', isSenior: false, totalScore: 5 },
      ]);

      const [row] = await service.getVideogamesData();

      const q = mockPrismaService.videogame.findMany.mock.calls[0][0];
      expect(q.include.team.include.assignedJurors).toEqual({ where: { isActive: true }, select: { id: true } });
      expect(row.totalJuradosAsignados).toBe(2);
      expect(row.evaluacionesCompletadas).toBe(1);
      expect(row.evaluacionesCompletadas).toBeLessThanOrEqual(row.totalJuradosAsignados!);
    });
  });
});
