import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { CreateEvaluationDto } from './createEvaluation.dto';

// [MODIFICACIÓN]: DTO para recibir múltiples evaluaciones en una sola petición
// Permite al jurado calificar varios videojuegos simultáneamente
// [APRENDIZAJE]: Reutilización de DTOs anidados con @ValidateNested
export class BatchEvaluationDto {
  @IsArray({
    message: 'Las evaluaciones deben enviarse en formato de lista (Array).',
  })
  @IsNotEmpty({ message: 'La lista de evaluaciones no puede estar vacía.' })
  @ArrayMinSize(1, {
    message: 'La lista de evaluaciones no puede estar vacía.',
  })
  @ArrayMaxSize(50, {
    message: 'El lote admite como máximo 50 evaluaciones.',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateEvaluationDto)
  evaluations: CreateEvaluationDto[];
}
