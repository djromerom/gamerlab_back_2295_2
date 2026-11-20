import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import {
  AdminRoleGuard,
  OptionalAdminRoleGuard,
} from '../auth/guards/admin-role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { ROLE_IDS } from '../auth/constants/roles';
import { SettingsService } from '../settings/settings.service';
import { RegistrationsOpenGuard } from '../settings/registrations-open.guard';
import { TeamsController } from './controllers/teams.controller';
import { TeamsService } from './services/teams.service';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

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
 * o `@GetUser()` de `by-n`: el administrador con sesión recibe datos con el ranking
 * oculto y el anónimo recibe `[]`.
 *
 * HU-48 (ARK-306): `final-score/team` y `final-score/videogame` ya no son públicas. Con el
 * JwtAuthGuard global real, sin sesión 401 y el estudiante 403 (AdminRoleGuard), sin llegar al
 * servicio; solo el Administrador recibe la nota.
 */
/** Igual que AdminRoleGuard, pero sin consultar la base de roles. */
const fakeAdminRoleGuard = {
  canActivate: (ctx: ExecutionContext) => {
    const { user } = ctx
      .switchToHttp()
      .getRequest<{ user?: { roleId: number } }>();
    if (user?.roleId === undefined) throw new UnauthorizedException();
    if (user.roleId !== ROLE_IDS.ADMIN) throw new ForbiddenException();
    return true;
  },
};

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

  beforeAll(async () => {
    const jwt = new JwtService({ secret: SECRET });
    adminToken = jwt.sign({ sub: 'admin', roleId: ROLE_IDS.ADMIN });
    studentToken = jwt.sign({ sub: 'stu', roleId: ROLE_IDS.STUDENT });

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
      controllers: [TeamsController],
      providers: [
        TestJwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        {
          provide: TeamsService,
          useValue: new TeamsService(
            {} as any,
            {} as any,
            {} as any,
            prisma as any,
            settings as any,
            blobRefsPassthrough(),
            { orderRows: async (rows: any[]) => rows.map((r, i) => ({ ...r, levelPosition: i + 1 })) } as any, // RankingService (HU-04)
          ),
        },
        { provide: SettingsService, useValue: settings },
      ],
    })
      .overrideGuard(RolePermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminRoleGuard)
      .useValue(fakeAdminRoleGuard)
      .overrideGuard(OptionalAdminRoleGuard)
      .useValue({ canActivate: () => true })
      // POST /teams lleva RegistrationsOpenGuard (inscripciones-back); aquí no se prueba.
      .overrideGuard(RegistrationsOpenGuard)
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
  });

  const get = (url: string, token?: string) => {
    const r = request(app.getHttpServer()).get(url);
    return token ? r.set('x-test-token', token) : r;
  };

  it.each([
    ['final-score/team', '/teams/final-score/team/1'],
    ['final-score/videogame', '/teams/final-score/videogame/2'],
  ])(
    '%s: sin sesión 401, estudiante 403, sin nota; admin con sesión datos',
    async (_name, url) => {
      const anon = await get(url);
      expect(anon.status).toBe(401);
      expect(JSON.stringify(anon.body)).not.toContain('finalScore');
      const stu = await get(url, studentToken);
      expect(stu.status).toBe(403);
      expect(JSON.stringify(stu.body)).not.toContain('finalScore');
      expect(prisma.teamFinalScore.findMany).not.toHaveBeenCalled();

      const res = await get(url, adminToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(rows);
    },
  );

  it('final-score/by-n: anónimo [], admin con sesión datos', async () => {
    const anon = await get('/teams/final-score/by-n/N1');
    expect(anon.status).toBe(200);
    expect(anon.body).toEqual([]);
    const res = await get('/teams/final-score/by-n/N1', adminToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
