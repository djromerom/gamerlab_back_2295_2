import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

export class BatchTeamEvaluationDto {
  @ApiProperty({ example: [{ videogameId: 24, score: 4.75 }] })
  @IsArray()
  evaluations: { videogameId: number; score: number }[];
}
