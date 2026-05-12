import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.useWebSocketAdapter(new IoAdapter(app));
	const configService: ConfigService = app.get(ConfigService);
	app.use(cookieParser());

	app.useGlobalPipes(new ValidationPipe({
		whitelist: true,
		transform: true,
		transformOptions: {
			enableImplicitConversion: true,
		}
	}));

	app.enableCors({
		origin: [
			configService.get<string>('FRONTEND_URL'),
			'http://localhost:5173'
		],
		credentials: true,
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
