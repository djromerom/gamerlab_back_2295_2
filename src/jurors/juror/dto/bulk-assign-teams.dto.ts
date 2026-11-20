import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
} from 'class-validator';
import { ConfirmWarningsField } from './confirm-warnings.decorator';

/** Máximo de equipos en una sola operación (HU-42). */
export const MAX_BULK_TEAMS = 50;

/**
 * HU-42 (ARK-275): asignar varios equipos a un mismo jurado en una sola operación.
 * Cada equipo se valida con las reglas de HU-08; un equipo bloqueado no frena a los demás.
 */
export class BulkAssignTeamsDto {
  @ApiProperty({
    example: 'd4e5f6a7-b8c9-4123-d456-678901234567',
    description: 'Jurado (o profesor) al que se le asignan los equipos.',
  })
  @IsString()
  @IsNotEmpty({ message: 'El ID del jurado es obligatorio' })
  jurorId: string;

  @ApiProperty({
    type: [Number],
    example: [12, 15, 18],
    description: `Equipos de la edición activa que se asignan. Sin repetir, de 1 a ${MAX_BULK_TEAMS}.`,
  })
  @IsArray({ message: 'teamIds debe ser una lista' })
  @ArrayMinSize(1, { message: 'Selecciona al menos un equipo' })
  @ArrayMaxSize(MAX_BULK_TEAMS, {
    message: `Se pueden asignar máximo ${MAX_BULK_TEAMS} equipos a la vez`,
  })
  @ArrayUnique({ message: 'teamIds no puede tener equipos repetidos' })
  @Type(() => Number)
  @IsInt({
    each: true,
    message: 'Cada ID de equipo debe ser un número entero',
  })
  @Min(1, { each: true, message: 'Cada ID de equipo debe ser mayor a 0' })
  teamIds: number[];

  @ConfirmWarningsField()
  confirmWarnings?: boolean;
}
