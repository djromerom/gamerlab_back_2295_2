import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const configService: ConfigService = app.get(ConfigService);

  // Behind nginx/Azure, TRUST_PROXY (e.g. 1 = one proxy hop) makes req.ip the real client IP,
  // which the request limits of the public routes depend on (BG-02).
  const trustProxy = configService.get<string>('TRUST_PROXY');
  if (trustProxy) {
    const hops = Number(trustProxy);
    app.getHttpAdapter().getInstance().set('trust proxy', Number.isNaN(hops) ? trustProxy : hops);
  }
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.enableCors({
    origin: [
      configService.get<string>('FRONTEND_URL'),
      'http://localhost:5173',
    ],
    credentials: true,
    // Permite al frontend leer el nombre del archivo en las descargas (HU-02)
    exposedHeaders: ['Content-Disposition'],
  });

  const env = configService.get<string>('NODE_ENV');
  if (env !== 'production') {
    // Swagger configuration
    const config = new DocumentBuilder()
      .setTitle('Arkad API')
      .setDescription('API for the Arkad backend system')
      .setVersion('2.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access',
      )
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'refresh',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
