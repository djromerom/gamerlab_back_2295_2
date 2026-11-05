import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Límite de grupos por jurado (HU-07). La configuración guardada es de HU-14. */
export class AutoAssignmentLimitsDto {
  @ApiPropertyOptional({
    example: 3,
    default: 3,
    description:
      'Máximo de grupos por jurado en la edición. Por defecto 3 (DEFAULT_ASSIGNMENT_LIMITS). Debe enviarse igual en preview y en confirm (o no enviarse en ninguno): con otro valor el plan recalculado es distinto y confirm responde 409 AUTO_ASSIGNMENT_OUTDATED.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxTeamsPerJuror debe ser un número entero' })
  @Min(1, { message: 'maxTeamsPerJuror debe ser mayor que 0' })
  @Max(20, { message: 'maxTeamsPerJuror no puede ser mayor que 20' })
  maxTeamsPerJuror?: number;
}

export class AutoAssignmentPreviewDto extends AutoAssignmentLimitsDto {
  @ApiPropertyOptional({
    example: 4,
    description:
      'Solo para simular con ediciones pasadas. Si no se envía, se usa la edición activa. La confirmación siempre guarda en la edición activa.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'editionId debe ser un número entero' })
  @Min(1, { message: 'editionId debe ser mayor que 0' })
  editionId?: number;
}

export class PlannedAssignmentDto {
  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt({ message: 'teamId debe ser un número entero' })
  @Min(1, { message: 'teamId debe ser mayor que 0' })
  teamId: number;

  @ApiProperty({ example: 'd4e5f6a7-b8c9-4123-d456-678901234567' })
  @IsString()
  @IsNotEmpty({ message: 'jurorId es obligatorio' })
  jurorId: string;
}

export class AutoAssignmentConfirmDto extends AutoAssignmentLimitsDto {
  @ApiProperty({
    type: [PlannedAssignmentDto],
    description:
      'Las asignaciones nuevas tal como las devolvió la vista previa (`assignments`).',
  })
  @IsArray({ message: 'assignments debe ser una lista' })
  @ArrayMaxSize(5000, { message: 'assignments tiene demasiados elementos' })
  @ValidateNested({ each: true })
  @Type(() => PlannedAssignmentDto)
  assignments: PlannedAssignmentDto[];

  @ApiPropertyOptional({
    example: 5,
    description:
      'Opcional. Si se envía debe ser la edición activa: con otra edición responde 400 EDITION_READ_ONLY y no guarda nada (la confirmación siempre guarda en la activa).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'editionId debe ser un número entero' })
  @Min(1, { message: 'editionId debe ser mayor que 0' })
  editionId?: number;
}
