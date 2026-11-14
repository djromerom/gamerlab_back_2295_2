import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AbsentJurorResponseResult } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsRFC3339,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAbsentJurorResponseDto {
  @ApiProperty({ example: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01' })
  @IsString()
  @IsNotEmpty({ message: 'El id del jurado es obligatorio' })
  @MaxLength(64, { message: 'El id del jurado no es válido' })
  jurorId: string;

  @ApiProperty({ enum: AbsentJurorResponseResult, example: 'ON_THE_WAY' })
  @IsEnum(AbsentJurorResponseResult, {
    message: 'El resultado debe ser ON_THE_WAY, CANNOT_ATTEND o NO_RESPONSE',
  })
  result: AbsentJurorResponseResult;

  @ApiPropertyOptional({
    description:
      'Hora estimada de llegada, solo con `ON_THE_WAY`. Con zona horaria (`Z` u offset).',
    example: '2026-11-26T15:30:00.000Z',
  })
  @IsOptional()
  @IsRFC3339({
    message:
      'La hora estimada debe ser una fecha ISO 8601 con zona horaria (por ejemplo 2026-11-26T15:30:00Z)',
  })
  estimatedArrivalAt?: string;
}
