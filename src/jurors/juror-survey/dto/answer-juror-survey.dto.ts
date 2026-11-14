import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  MAX_SURVEY_COMMENTS,
  MAX_SURVEY_SCORE,
  MIN_SURVEY_SCORE,
} from '../survey-rules';

const SCORES = Array.from(
  { length: MAX_SURVEY_SCORE - MIN_SURVEY_SCORE + 1 },
  (_, i) => MIN_SURVEY_SCORE + i,
);
const RANGE_MESSAGE = `debe ser un número entero de ${MIN_SURVEY_SCORE} a ${MAX_SURVEY_SCORE}`;

/** Un campo de la encuesta: obligatorio, entero de 1 a 5, con mensaje en español. */
const SurveyScore = (label: string) =>
  applyDecorators(
    ApiProperty({
      minimum: MIN_SURVEY_SCORE,
      maximum: MAX_SURVEY_SCORE,
      example: 4,
      description: label,
    }),
    Type(() => Number),
    // Una sola regla (entero de 1 a 5) para que el 400 traiga un único mensaje por campo.
    IsIn(SCORES, { message: `«${label}» ${RANGE_MESSAGE}` }),
  );

/** HU-17: los 6 campos son obligatorios (de 1 a 5); el comentario es opcional. */
export class AnswerJurorSurveyDto {
  @SurveyScore('Facilidad para iniciar sesión y entrar a la plataforma')
  loginEase: number;

  @SurveyScore('Claridad para saber qué grupos evaluar')
  groupsClarity: number;

  @SurveyScore('Facilidad para calificar (formulario de evaluación)')
  gradingEase: number;

  @SurveyScore('Estabilidad y rapidez (no perdí datos, no se cerró la sesión)')
  stability: number;

  @SurveyScore('Organización de la feria (escarapela, registro y avisos)')
  fairOrganization: number;

  @SurveyScore('Experiencia general')
  overall: number;

  @ApiPropertyOptional({
    maxLength: MAX_SURVEY_COMMENTS,
    description:
      'Comentarios y sugerencias (opcional). Se guarda sin espacios al inicio y al final; vacío = sin comentario.',
  })
  @IsOptional()
  @IsString({ message: 'Los comentarios deben ser texto' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(MAX_SURVEY_COMMENTS, {
    message: `Los comentarios admiten como máximo ${MAX_SURVEY_COMMENTS} caracteres`,
  })
  comments?: string;
}
