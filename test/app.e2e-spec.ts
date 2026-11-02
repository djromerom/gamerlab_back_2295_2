import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { AzureStorageService } from './../src/upload/azure-storage.service';

// Sin .env (CI): valores de prueba para las variables que se exigen al construir
// los servicios. No son secretos reales; si ya están definidas, se respetan.
process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    // Azure exige credenciales y crea el contenedor al iniciar; esta prueba no lo usa
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AzureStorageService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
