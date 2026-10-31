import { INestApplication, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import { OptionalAdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { ROLE_IDS } from '../auth/constants/roles';
import { ReportsController } from '../reports/reports.controller';
import { ReportsService } from '../reports/reports.service';
import { SettingsService } from '../settings/settings.service';
import { TeamsController } from './controllers/teams.controller';
import { TeamsService } from './services/teams.service';

const SECRET = 'test-secret';

@Injectable()
class TestJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromHeader('x-test-token'),
      secretOrKey: SECRET,
    });
  }
  validate(payload: { sub: string; roleId: number }) {
    return { id: payload.sub, roleId: payload.roleId };
  }
}

/**
 * ARK-SP1: prueba de cableado. Falla si se quita `@UseGuards(OptionalJwtAuthGuard)`
 * o `@GetUser()` de las rutas de ranking: el administrador con sesión recibe datos con
 * el ranking oculto y el anónimo recibe `[]` / 403 según la ruta.
 */
describe('Cableado de controladores con el ranking oculto (ARK-SP1)', () => {
  let app: INestApplication;
  let adminToken: string;
  let studentToken: string;

  const rows = [
    { teamId: 1, teamCode: 'N1-A', teamName: 'T', logoUrl: 'l', finalScore: 4 },
  ];
  const prisma = {
    teamFinalScore: { findMany: jest.fn() },
    edition: { findFirst: jest.fn() },
  };
  const settings = { isRankingVisible: jest.fn() };
  const reports = { getVideogamesData: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn() };

  beforeAll(async () => {
    const jwt = new JwtService({ secret: SECRET });
    adminToken = jwt.sign({ sub: 'admin', roleId: ROLE_IDS.ADMIN });
    studentToken = jwt.sign({ sub: 'stu', roleId: ROLE_IDS.STUDENT });

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
      controllers: [TeamsController, ReportsController],
      providers: [
        TestJwtStrategy,
        {
          provide: TeamsService,
          useValue: new TeamsService(
            {} as any,
            {} as any,
            {} as any,
            prisma as any,
            settings as any,
          ),
        },
        { provide: ReportsService, useValue: reports },
        { provide: SettingsService, useValue: settings },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    })
      .overrideGuard(RolePermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalAdminRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    settings.isRankingVisible.mockResolvedValue(false);
    prisma.teamFinalScore.findMany.mockResolvedValue(rows);
    prisma.edition.findFirst.mockResolvedValue({ id: 3 });
    cache.get.mockResolvedValue(undefined);
    reports.getVideogamesData.mockResolvedValue([]);
  });

  const get = (url: string, token?: string) => {
    const r = request(app.getHttpServer()).get(url);
    return token ? r.set('x-test-token', token) : r;
  };

  it('final-score/team: anónimo 403, estudiante 403, admin con sesión datos', async () => {
    expect((await get('/teams/final-score/team/1')).status).toBe(403);
    expect((await get('/teams/final-score/team/1', studentToken)).status).toBe(
      403,
    );
    const res = await get('/teams/final-score/team/1', adminToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });

  it('final-score/videogame: anónimo 403, admin con sesión datos', async () => {
    expect((await get('/teams/final-score/videogame/2')).status).toBe(403);
    const res = await get('/teams/final-score/videogame/2', adminToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });

  it('final-score/by-n: anónimo [], admin con sesión datos', async () => {
    const anon = await get('/teams/final-score/by-n/N1');
    expect(anon.status).toBe(200);
    expect(anon.body).toEqual([]);
    const res = await get('/teams/final-score/by-n/N1', adminToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('reports/videojuegoData: el administrador con sesión llega al servicio con su usuario', async () => {
    await get('/reports/videojuegoData', adminToken);
    expect(reports.getVideogamesData).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin', roleId: ROLE_IDS.ADMIN }),
    );
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('reports/videojuegoData: el anónimo pasa por la caché pública', async () => {
    const res = await get('/reports/videojuegoData');
    expect(res.status).toBe(200);
    expect(cache.get).toHaveBeenCalled();
  });
});
