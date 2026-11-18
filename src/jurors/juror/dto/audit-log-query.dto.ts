import {
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  IsEnum,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ManualJurorAssignmentAction } from '@prisma/client';

export class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  jurorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'teamId debe ser un número entero' })
  @Min(1, { message: 'teamId debe ser mayor a 0' })
  teamId?: number;

  @IsOptional()
  @IsEnum(ManualJurorAssignmentAction, {
    message: `action debe ser uno de: ${Object.values(
      ManualJurorAssignmentAction,
    ).join(', ')}`,
  })
  action?: ManualJurorAssignmentAction;

  @IsOptional()
  @IsString()
  actorUserId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'from debe ser una fecha válida en formato ISO' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to debe ser una fecha válida en formato ISO' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un número entero' })
  @Min(1, { message: 'page debe ser mayor a 0' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un número entero' })
  @Min(1, { message: 'limit debe ser mayor a 0' })
  @Max(100, { message: 'limit no puede ser mayor a 100' })
  limit?: number = 20;
}