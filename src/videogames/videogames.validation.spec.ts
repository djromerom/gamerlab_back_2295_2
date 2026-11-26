import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { VideogamesController } from './videogames.controller';
import { VideogamesService } from './videogames.service';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';

/** M3 y M9: validación de parámetros en los endpoints públicos de videojuegos. */
describe('VideogamesController — validación (M3, M9)', () => {
  let app: INestApplication;
  const service = { findAll: jest.fn(), findOne: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // toggle-like lleva LikeThrottlerGuard, que necesita la configuración del ThrottlerModule
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
      controllers: [VideogamesController],
      providers: [{ provide: VideogamesService, useValue: service }],
    })
      .overrideGuard(RolePermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('GET /videogames/abc responde 400 y no llega al servicio', async () => {
    const res = await request(app.getHttpServer()).get('/videogames/abc').expect(400);
    expect((res.body as { message: string }).message).toBe('El identificador debe ser un número entero');
    expect(service.findOne).not.toHaveBeenCalled();
  });

  it('GET /videogames sin limit conserva la lista completa', async () => {
    service.findAll.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/videogames').expect(200);
    expect(service.findAll).toHaveBeenCalledWith(undefined, undefined);
  });

  it('GET /videogames respeta limit/page y recorta a 100', async () => {
    service.findAll.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/videogames?limit=100000&page=2').expect(200);
    expect(service.findAll).toHaveBeenCalledWith(100, 2);
  });

  it('GET /videogames con limit inválido responde 400', async () => {
    await request(app.getHttpServer()).get('/videogames?limit=abc').expect(400);
  });
});
