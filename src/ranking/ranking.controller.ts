import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { AppUser } from '../auth/jwt.strategy';
import { DecideTieDto } from './dto/decide-tie.dto';
import {
  EditionQueryDto,
  RankingQueryDto,
  TiesQueryDto,
} from './dto/ranking-query.dto';
import { RankingService } from './ranking.service';

/**
 * HU-04 (ARK-98): ranking oficial por nivel, ganadores, empates y decisiones de desempate.
 * Consulta y cierre: solo Administrador. Decidir un empate: el profesor de los grupos empatados
 * (servicio MySubjects, el mismo del panel de profesores) o el Administrador.
 */
@ApiTags('Ranking')
@ApiBearerAuth()
@Controller('ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get()
  @UseGuards(AdminRoleGuard)
  @ApiOperation({
    summary: 'Ranking oficial por nivel con empates (administrador)',
  })
  @ApiOkResponse({
    description:
      'Niveles con equipos ordenados, podio, empates y equipos sin nota',
  })
  @ApiNotFoundResponse({
    description: 'No hay edición activa o no existe la edición',
  })
  getRanking(@Query() query: RankingQueryDto) {
    return this.ranking.getRanking(query);
  }

  @Get('winners')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({
    summary:
      'Ganadores de cada nivel y empates que tocan el podio (administrador)',
  })
  getWinners(@Query() query: RankingQueryDto) {
    return this.ranking.getWinners(query);
  }

  @Get('ties')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({
    summary: 'Empates detectados, con la regla que les aplica (administrador)',
  })
  getTies(@Query() query: TiesQueryDto) {
    return this.ranking.getTies(query);
  }

  @Get('decisions')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({
    summary: 'Decisiones de desempate registradas (administrador)',
  })
  getDecisions(@Query() query: EditionQueryDto) {
    return this.ranking.getDecisions(query.editionId);
  }

  @Post('finalize')
  @HttpCode(200)
  @UseGuards(AdminRoleGuard)
  @ApiOperation({
    summary:
      'Definir el ranking final: guarda posiciones por nivel (administrador)',
  })
  @ApiConflictResponse({
    description: 'Hay empates pendientes; la respuesta los lista',
  })
  finalize(@Query() query: EditionQueryDto, @GetUser() user: AppUser) {
    return this.ranking.finalize(user, query.editionId);
  }

  @Get('my-ties')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MySubjects')
  @ApiOperation({
    summary: 'Empates de la edición activa que decide el profesor autenticado',
  })
  getMyTies(@GetUser() user: AppUser) {
    return this.ranking.getMyTies(user);
  }

  @Post('ties/decision')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MySubjects')
  @ApiOperation({
    summary:
      'Registrar la decisión de un empate (profesor de los grupos o administrador)',
  })
  @ApiForbiddenResponse({
    description: 'El usuario no es el profesor común de los grupos empatados',
  })
  @ApiNotFoundResponse({
    description: 'El empate ya no existe (cambiaron las notas)',
  })
  @ApiConflictResponse({
    description: 'El empate ya tiene decisión o se resuelve por inscripción',
  })
  decide(@Body() dto: DecideTieDto, @GetUser() user: AppUser) {
    return this.ranking.decide(user, dto);
  }
}
