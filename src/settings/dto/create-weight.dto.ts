import { IsNumber, Min, Max } from 'class-validator';

export class CreateWeightDto {
  @IsNumber()
  editionId: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  seniorPct: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  juniorPct: number;
}