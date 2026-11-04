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
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SettingsService } from '../settings/settings.service';

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
 * ARK-SP1 T29: prueba de cableado con el guard real. Falla si se quita
 * `@UseGuards(OptionalJwtAuthGuard)` o `@GetUser()` de NRCData / DatosGraficoMateria:
 * el administrador con sesión recibiría `undefined` como usuario y vería null.
 */
describe('Cableado de NRCData y DatosGraficoMateria con el ranking oculto (ARK-SP1 T29)', () => {
  let app: INestApplication;
  let adminToken: string;
  let studentToken: string;

  const reports = {
    getNrcWithSubjectNameAndAverage: jest.fn(),
    getSubjectAverageScores: jest.fn(),
  };
  const settings = { isRankingVisible: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn() };

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
    reports.getNrcWithSubjectNameAndAverage.mockResolvedValue([]);
    reports.getSubjectAverageScores.mockResolvedValue([]);
  });

  const get = (url: string, token?: string) => {
    const r = request(app.getHttpServer()).get(url);
    return token ? r.set('x-test-token', token) : r;
  };

  const rutas = [
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
    '%s: el anónimo sigue siendo público (200) y llega sin usuario',
    async (url, metodo) => {
      const res = await get(url);
      expect(res.status).toBe(200);
      expect(reports[metodo]).toHaveBeenCalledWith(undefined, undefined);
    },
  );
});
