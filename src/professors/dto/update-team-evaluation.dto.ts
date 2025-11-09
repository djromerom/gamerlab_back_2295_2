import { IsInt, IsNumber, IsOptional, Min, IsBoolean } from 'class-validator';

export class UpdateTeamEvaluationDto {
  // historic field: teamId (id del equipo). Now optional — the front
  // may also send videogameId (id del videojuego). Service will accept
  // either `teamId` or `videogameId`.
  @IsOptional()
  @IsInt()
  @Min(1)
  teamId?: number;

  // nuevo: id del videojuego (preferred si el front lo tiene)
  @IsOptional()
  @IsInt()
  @Min(1)
  videogameId?: number;

  @IsNumber()
  @Min(0)
  score: number;

  @IsOptional()
  @IsBoolean()
  isSenior?: boolean;
}
