import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrismaService = {
    team: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService, 
        { 
          provide: PrismaService, 
          useValue: mockPrismaService 
        }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getJuradosDataForTeamLeader (BG-02)', () => {
    const jurados = [
      { id: 'j1', nombre: 'Uno', correo: 'uno@example.com', estado: 'CONFIRMADO', videojuegosAsignados: ['Mi Juego', 'Otro'], videojuegosCompletos: ['Otro'] },
      { id: 'j2', nombre: 'Dos', correo: 'dos@example.com', estado: 'CONFIRMADO', videojuegosAsignados: ['Otro'], videojuegosCompletos: [] },
    ];

    it('devuelve solo los jurados asignados al juego del equipo del usuario', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue({ videogame: { name: 'Mi Juego' } });
      jest.spyOn(service, 'getJuradosData').mockResolvedValue(jurados);

      const result = await service.getJuradosDataForTeamLeader('student-1');

      expect(mockPrismaService.team.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'student-1', isActive: true } }),
      );
      expect(result).toEqual([
        { ...jurados[0], videojuegosAsignados: ['Mi Juego'], videojuegosCompletos: [] },
      ]);
    });

    it('devuelve una lista vacía si el usuario no lidera un equipo con videojuego', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue(null);
      const spy = jest.spyOn(service, 'getJuradosData');

      await expect(service.getJuradosDataForTeamLeader('profesor-1')).resolves.toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
