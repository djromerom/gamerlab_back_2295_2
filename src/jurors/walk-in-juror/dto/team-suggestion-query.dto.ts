import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Tope de grupos que se proponen por defecto (HU-24). */
export const DEFAULT_MAX_TEAMS = 3;
/** Máximo de grupos por propuesta o por asignación (HU-24). */
export const MAX_TEAMS_LIMIT = 10;

export class TeamSuggestionQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_MAX_TEAMS,
    minimum: 1,
    maximum: MAX_TEAMS_LIMIT,
    description: 'Máximo de grupos que se proponen (todos del mismo nivel).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxTeams debe ser un número entero' })
  @Min(1, { message: 'maxTeams debe ser al menos 1' })
  @Max(MAX_TEAMS_LIMIT, {
    message: `maxTeams no puede pasar de ${MAX_TEAMS_LIMIT}`,
  })
  maxTeams?: number;
}
