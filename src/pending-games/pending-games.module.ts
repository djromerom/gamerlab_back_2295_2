
import { Module } from '@nestjs/common';
import { PendingGamesService } from './pending-games.service';
import { PendingGamesController } from './pending-games.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, AuthModule, UploadModule], // Importa Prisma y Auth para manejar la base de datos y autenticación
  controllers: [PendingGamesController], // Controlador para manejar las rutas de pending-games
  exports: [PendingGamesService], // HU-37: el aviso de pendientes reutiliza el conteo
  providers: [PendingGamesService, PendingGamesGuard], // Servicio y guard para manejar la lógica de negocio y permisos
})
export class PendingGamesModule {}