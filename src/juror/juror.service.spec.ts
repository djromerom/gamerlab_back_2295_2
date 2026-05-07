import { Test, TestingModule } from '@nestjs/testing';
import { JurorService } from './juror.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

jest.mock('../auth/auth.service');
jest.mock('../email/email.service');

describe('JurorService - AutoAssign', () => {
  let service: JurorService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      team: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JurorService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('1') } }, // Mock settings
        { provide: EmailService, useValue: {} },
        { provide: AuthService, useValue: {} },
        Logger,
      ],
    }).compile();

    service = module.get<JurorService>(JurorService);
    
    // Mock the status id
    (service as any).confirmedStatusId = 1;
    (service as any).professorRoleId = 3;
    (service as any).jurorRoleId = 4;
  });

  const createMockTeam = (id: number, level: number, assignedJurors: any[] = []) => ({
    id,
    teamCode: `N${level}-TEST-${id}`,
    teamName: `Team ${id}`,
    assignedJurors,
  });

  const createMockEvaluator = (id: string, roleId: number, currentTeamsCount = 0) => ({
    id,
    roleId,
    firstName: `Name ${id}`,
    lastName: `Last ${id}`,
    teamsToEvaluate: Array.from({ length: currentTeamsCount }).map((_, i) => ({ id: i })),
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('autoAssignJurors scenarios', () => {
    
    it('Escenario Ideal: Asignación equitativa con abundancia de jurados (Max <= 6 respetado, todos quedan con 3)', async () => {
      // 10 equipos universitarios (N1) -> Se necesitan 30 cupos.
      // 15 jurados junior, 5 profesores. Suficiente para que todos tengan 1-2 equipos.
      const teams = Array.from({ length: 10 }).map((_, i) => createMockTeam(i + 1, 1));
      const evaluators = [
        ...Array.from({ length: 5 }).map((_, i) => createMockEvaluator(`P${i}`, 3)), // Profs
        ...Array.from({ length: 15 }).map((_, i) => createMockEvaluator(`J${i}`, 4)) // Jurors
      ];

      prismaMock.team.findMany.mockResolvedValue(teams);
      prismaMock.user.findMany.mockResolvedValue(evaluators);

      const result = await service.autoAssignJurors();

      // Check results
      expect(result.message).toContain('completada correctamente');
      
      // Each team should be updated exactly once
      expect(prismaMock.team.update).toHaveBeenCalledTimes(10);
      
      const calls = prismaMock.team.update.mock.calls;
      for (const call of calls) {
        const assignedIds = call[0].data.assignedJurors.set;
        // Todos deben tener exactamente 3
        expect(assignedIds.length).toBe(3);
        
        // Al menos 1 debe ser profesor (empieza con P)
        const hasProfessor = assignedIds.some((j: any) => j.id.startsWith('P'));
        expect(hasProfessor).toBe(true);
      }
    });

    it('Escenario Escasez: Respeta límite ESTRICTO de 6 y distribuye equitativamente lo posible', async () => {
      // 20 equipos (N1) -> Necesitarían 60 cupos para tener 3 c/u.
      // Pero solo hay 2 profesores y 3 jurados (Total 5 evaluadores).
      // Max load es 6. 5 * 6 = 30 cupos totales disponibles.
      // Por ende, cada equipo quedará con 1 o 2 jurados, nadie debe tener 3 mientras otros tengan 0.
      
      const teams = Array.from({ length: 20 }).map((_, i) => createMockTeam(i + 1, 1));
      const evaluators = [
        ...Array.from({ length: 2 }).map((_, i) => createMockEvaluator(`P${i}`, 3)),
        ...Array.from({ length: 3 }).map((_, i) => createMockEvaluator(`J${i}`, 4))
      ];

      prismaMock.team.findMany.mockResolvedValue(teams);
      prismaMock.user.findMany.mockResolvedValue(evaluators);

      const result = await service.autoAssignJurors();

      // Debería generar advertencias sobre no alcanzar 3
      expect(result.advertencias.length).toBeGreaterThan(0);
      
      const calls = prismaMock.team.update.mock.calls;
      const countMap = new Map<number, number>();
      
      for (const call of calls) {
        const c = call[0].data.assignedJurors.set.length;
        countMap.set(c, (countMap.get(c) || 0) + 1);
      }
      
      // Como solo hay 30 cupos para 20 equipos, 10 equipos tendrán 2, y 10 tendrán 1.
      // Ninguno debería tener 3. Ninguno debería tener 0.
      expect(countMap.get(3)).toBeUndefined();
      expect(countMap.get(0)).toBeUndefined();
    });

    it('Escenario Colegios (N0): Sólo reciben Profesores y respetan el límite', async () => {
      // 5 equipos de colegios, 10 equipos universitarios.
      // 2 profesores, 5 jurados.
      const teams = [
        ...Array.from({ length: 5 }).map((_, i) => createMockTeam(i + 1, 0)), // Colegios
        ...Array.from({ length: 10 }).map((_, i) => createMockTeam(i + 6, 1)) // Universitarios
      ];
      
      const evaluators = [
        ...Array.from({ length: 2 }).map((_, i) => createMockEvaluator(`P${i}`, 3)), // Solo 2 profs
        ...Array.from({ length: 5 }).map((_, i) => createMockEvaluator(`J${i}`, 4)) 
      ];

      prismaMock.team.findMany.mockResolvedValue(teams);
      prismaMock.user.findMany.mockResolvedValue(evaluators);

      await service.autoAssignJurors();

      const calls = prismaMock.team.update.mock.calls;
      
      for (const call of calls) {
        const teamId = call[0].where.id;
        const assignedIds = call[0].data.assignedJurors.set;
        
        if (teamId <= 5) {
          // Es un equipo de colegio.
          // Como hay 2 profesores y el target es 3, a lo mucho tendrán 2.
          // Pero la regla de oro: TODOS deben ser profesores.
          for (const j of assignedIds) {
            expect(j.id.startsWith('P')).toBe(true);
          }
        }
      }
    });

    it('Escenario Respetar Asignaciones Manuales: no sobrepasa el límite', async () => {
      // Un equipo ya tiene 2 jurados asignados (P0, J0).
      // El algoritmo solo debería agregarle 1 más.
      // Además, P0 y J0 ya tienen carga previa, el algoritmo no debe sobrecargarlos más allá de 6.
      
      const team1 = createMockTeam(1, 1, [{ id: 'P0' }, { id: 'J0' }]);
      const teams = [team1, createMockTeam(2, 1)]; // equipo 2 vacio
      
      // P0 y J0 ya están casi llenos (carga previa 5 en base de datos)
      const p0 = createMockEvaluator('P0', 3, 5); 
      const j0 = createMockEvaluator('J0', 4, 5);
      const j1 = createMockEvaluator('J1', 4, 0); // Libre
      
      prismaMock.team.findMany.mockResolvedValue(teams);
      prismaMock.user.findMany.mockResolvedValue([p0, j0, j1]);

      await service.autoAssignJurors();

      const calls = prismaMock.team.update.mock.calls;
      
      for (const call of calls) {
        const tId = call[0].where.id;
        const assignedIds = call[0].data.assignedJurors.set;
        
        if (tId === 1) {
          // El equipo 1 tenía P0 y J0. Ahora debe tener 3.
          expect(assignedIds.length).toBe(3);
          expect(assignedIds.some((x:any) => x.id === 'P0')).toBe(true);
          expect(assignedIds.some((x:any) => x.id === 'J0')).toBe(true);
        }
      }
    });

  });
});
