import { IsString, IsInt, IsArray, IsOptional, IsNumber } from 'class-validator';

export class VideogameResponseDto {
  @IsInt()
  videogameId: number;

  @IsString()
  videogameName: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  description?: string; // Agregar el campo "descripcion"

  @IsString()
  teamName: string;

  @IsArray()
  members: { fullName: string }[];

  @IsString()
  @IsOptional()
  nrc?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsNumber()
  @IsOptional()
  totalScore?: number;

  @IsString()
  @IsOptional()
  comments?: string;

  /** ARK-264 (BG-64): puntaje por criterio de la evaluación del jurado. */
  @IsArray()
  @IsOptional()
  criteria?: GradedCriterionScore[];
}

export interface GradedCriterionScore {
  criterionId: number;
  name: string;
  score: number;
}