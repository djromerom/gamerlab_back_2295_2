import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { AppUser } from '../auth/jwt.strategy';
import {
  EditionQueryDto,
  RankingQueryDto,
  TiesQueryDto,
} from './dto/ranking-query.dto';
import { RankingService } from './ranking.service';

/**
 * HU-04 (ARK-98): ranking oficial por nivel, ganadores y empates. Solo Administrador.
 * HU-47 (ARK-304): los empates se resuelven siempre por fecha de inscripción; se quitaron
 * `GET /ranking/my-ties` y `POST /ranking/ties/decision` (los profesores ya no eligen).
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
    summary:
      'Historial de decisiones de desempate; no cambian el orden desde HU-47 (administrador)',
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
  finalize(@Query() query: EditionQueryDto, @GetUser() user: AppUser) {
    return this.ranking.finalize(user, query.editionId);
  }
}
