import { Module } from '@nestjs/common';
import { VideogamesService } from './pg.service';
import { VideogamesController } from './pg.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';

@Module({
  imports: [PrismaModule, AuthModule], // Importa Prisma y Auth para manejar la base de datos y autenticación
  controllers: [VideogamesController], // Controlador para manejar las rutas de pending-games
  providers: [VideogamesService, PendingGamesGuard], // Servicio y guard para manejar la lógica de negocio y permisos
})
export class PendingGamesModule {}
