import { IsNumber, Min, Max, IsOptional } from 'class-validator';

export class CreateWeightDto {
  @IsOptional()
  @IsNumber()
  editionId?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  seniorPct: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  juniorPct: number;
}