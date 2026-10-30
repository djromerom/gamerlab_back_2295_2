import { IsInt, IsNumber, IsOptional, Min, Max, IsBoolean } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class UpdateTeamEvaluationDto {
  // Use videogameId only (preferred). teamId support removed.
  @ApiProperty({ example: 34, description: 'Videogame id (required), integer > 0' })
  @IsInt()
  @Min(1)
  videogameId: number;

  @ApiProperty({ example: 4.75, description: 'Score from 0 to 5, with at most two decimal places' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5)
  score: number;

  @ApiPropertyOptional({ example: true, description: 'Flag indicating this evaluation is by a senior juror' })
  @IsOptional()
  @IsBoolean()
  isSenior?: boolean;
}
