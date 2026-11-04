import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JurorEditionStatus, JurorType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../common/utils/trim-transform';
import { EditionIdDto } from './edition-id.dto';

export const MAX_STATUS_ITEMS = 500;

export class JurorEditionStatusItemDto {
  @ApiProperty({ example: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01' })
  @Transform(trimString)
  @IsString({ message: 'jurorId debe ser texto' })
  @IsNotEmpty({ message: 'jurorId es obligatorio' })
  @MaxLength(64, { message: 'jurorId no puede superar los 64 caracteres' })
  jurorId: string;

  @ApiProperty({ enum: JurorEditionStatus, example: 'CONFIRMED' })
  @IsIn(Object.values(JurorEditionStatus), {
    message: 'status debe ser PENDING, CONFIRMED o DECLINED',
  })
  status: JurorEditionStatus;

  @ApiPropertyOptional({
    enum: JurorType,
    description: 'Si no se envía, se conserva el tipo actual',
  })
  @IsOptional()
  @IsIn(Object.values(JurorType), {
    message: 'type debe ser OFFICIAL o BACKUP',
  })
  type?: JurorType;
}

export class UpdateJurorEditionStatusDto extends EditionIdDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Si es true, los Pendientes que no vienen en items pasan a Declinó',
  })
  @IsOptional()
  @IsBoolean({ message: 'declineRemaining debe ser true o false' })
  declineRemaining?: boolean;

  @ApiProperty({ type: [JurorEditionStatusItemDto] })
  @IsArray({ message: 'items debe ser una lista' })
  @ArrayNotEmpty({ message: 'items no puede estar vacío' })
  @ArrayMaxSize(MAX_STATUS_ITEMS, {
    message: `items admite como máximo ${MAX_STATUS_ITEMS} filas`,
  })
  @ArrayUnique((item: JurorEditionStatusItemDto) => item?.jurorId, {
    message: 'items no puede repetir un jurorId',
  })
  @ValidateNested({ each: true })
  @Type(() => JurorEditionStatusItemDto)
  items: JurorEditionStatusItemDto[];
}
