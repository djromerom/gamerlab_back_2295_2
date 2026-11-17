import { INestApplication, Injectable } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import { OptionalAdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ROLE_IDS } from '../auth/constants/roles';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

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
 * BG-67 (ARK-268): cableado con el JwtAuthGuard global real. Las tres rutas de notas ya no son
 * públicas: sin sesión 401; con sesión el usuario llega al servicio (el 403 por rol lo prueba
 * `auth/route-access.spec.ts` con el RolePermissionGuard real). materiaData sigue pública.
 */
describe('Cableado de las rutas de notas de /reports (BG-67)', () => {
  let app: INestApplication;
  let adminToken: string;
  let studentToken: string;

  const reports = {
    getNrcWithSubjectNameAndAverage: jest.fn(),
    getSubjectAverageScores: jest.fn(),
    getVideogamesData: jest.fn(),
    getSubjects: jest.fn(),
  };

  beforeAll(async () => {
    const jwt = new JwtService({ secret: SECRET });
    adminToken = jwt.sign({ sub: 'admin', roleId: ROLE_IDS.ADMIN });
    studentToken = jwt.sign({ sub: 'stu', roleId: ROLE_IDS.STUDENT });

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }]),
      ],
      controllers: [ReportsController],
      providers: [
        TestJwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: ReportsService, useValue: reports },
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
    reports.getNrcWithSubjectNameAndAverage.mockResolvedValue([]);
    reports.getSubjectAverageScores.mockResolvedValue([]);
    reports.getVideogamesData.mockResolvedValue([]);
    reports.getSubjects.mockResolvedValue([]);
  });

  const get = (url: string, token?: string) => {
    const r = request(app.getHttpServer()).get(url);
    return token ? r.set('x-test-token', token) : r;
  };

  const rutas = [
    ['/reports/videojuegoData', 'getVideogamesData'],
    ['/reports/NRCData', 'getNrcWithSubjectNameAndAverage'],
    ['/reports/DatosGraficoMateria', 'getSubjectAverageScores'],
  ] as const;

  it.each(rutas)(
    '%s: el administrador con sesión llega al servicio con su usuario',
    async (url, metodo) => {
      const res = await get(url, adminToken);
      expect(res.status).toBe(200);
      expect(reports[metodo]).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'admin', roleId: ROLE_IDS.ADMIN }),
        undefined, // ARK-135: sin ?editionId= (la edición activa)
      );
    },
  );

  it.each(rutas)(
    '%s: el estudiante llega con su usuario (no admin)',
    async (url, metodo) => {
      await get(url, studentToken);
      expect(reports[metodo]).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: ROLE_IDS.STUDENT }),
        undefined,
      );
    },
  );

  it.each(rutas)(
    '%s: sin sesión responde 401 y no llega al servicio',
    async (url, metodo) => {
      const res = await get(url);
      expect(res.status).toBe(401);
      expect(reports[metodo]).not.toHaveBeenCalled();
    },
  );

  it('materiaData sigue pública (200 sin sesión)', async () => {
    const res = await get('/reports/materiaData');
    expect(res.status).toBe(200);
  });
});
