import { IsInt, IsNumber, IsOptional, Min, IsBoolean } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class UpdateTeamEvaluationDto {
  // Use videogameId only (preferred). teamId support removed.
  @ApiProperty({ example: 34, description: 'Videogame id (required), integer > 0' })
  @IsInt()
  @Min(1)
  videogameId: number;

  @ApiProperty({ example: 8.5, description: 'Numeric score to assign to the evaluation' })
  @IsNumber()
  @Min(0)
  score: number;

  @ApiPropertyOptional({ example: true, description: 'Flag indicating this evaluation is by a senior juror' })
  @IsOptional()
  @IsBoolean()
  isSenior?: boolean;
}
