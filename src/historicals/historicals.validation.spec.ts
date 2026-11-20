import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HistoricalsController } from './historicals.controller';
import { HistoricalsService } from './historicals.service';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';

/** M3: un id no numérico debe dar 400, no 500. */
describe('HistoricalsController — validación (M3)', () => {
  let app: INestApplication;
  const service = { getHistoricalVideogamesByEdition: jest.fn(), getHistoricalGameFile: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HistoricalsController],
      providers: [{ provide: HistoricalsService, useValue: service }],
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

  it('GET /historicals/historical-videogames/abc responde 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/historicals/historical-videogames/abc')
      .expect(400);
    expect((res.body as { message: string }).message).toBe('El identificador debe ser un número entero');
    expect(service.getHistoricalVideogamesByEdition).not.toHaveBeenCalled();
  });

  it('con un id numérico llega al servicio', async () => {
    service.getHistoricalVideogamesByEdition.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/historicals/historical-videogames/3')
      .expect(200);
    expect(service.getHistoricalVideogamesByEdition).toHaveBeenCalledWith(3);
  });

  it('HU-40: GET /historicals/videogames/abc/game-file responde 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/historicals/videogames/abc/game-file')
      .expect(400);
    expect((res.body as { message: string }).message).toBe('El identificador debe ser un número entero');
    expect(service.getHistoricalGameFile).not.toHaveBeenCalled();
  });

  it('HU-40: con un id numérico pide el archivo del juego histórico', async () => {
    service.getHistoricalGameFile.mockResolvedValue({ id: 12, gameFileURL: '', entry: '' });
    await request(app.getHttpServer())
      .get('/historicals/videogames/12/game-file')
      .expect(200);
    expect(service.getHistoricalGameFile).toHaveBeenCalledWith(12);
  });
});
