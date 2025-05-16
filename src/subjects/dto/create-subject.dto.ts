// src/subjects/dto/create-subject.dto.ts
import { IsString, IsInt, IsOptional, Length, Min } from 'class-validator'; // Use class-validator for validation

export class CreateSubjectDto {
  @IsString()
  @Length(1, 50)
  name: string; // Corresponds to 'nombre' in DB

  @IsString()
  @Length(1, 50)
  code: string; // Corresponds to 'codigo' in DB

  @IsInt()
  @Min(1) // Example validation: se mester should be at least 1
  semester: number; // Corresponds to 'semestre' in DB
}
