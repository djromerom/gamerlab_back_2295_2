import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JurorType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { normalizeEmailValue } from '../../common/utils/trim-transform';
import { EditionIdDto } from './edition-id.dto';

export class EnrollJurorDto extends EditionIdDto {
  @ApiProperty({ example: 'ana.perez@empresa.com' })
  @Transform(normalizeEmailValue)
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(50, { message: 'El correo no puede superar los 50 caracteres' })
  email: string;

  @ApiPropertyOptional({ enum: JurorType, default: JurorType.OFFICIAL })
  @IsOptional()
  @IsIn(Object.values(JurorType), {
    message: 'type debe ser OFFICIAL o BACKUP',
  })
  type?: JurorType;
}
