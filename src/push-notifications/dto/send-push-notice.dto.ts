import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  PUSH_BODY_MAX_LENGTH,
  PUSH_TITLE_MAX_LENGTH,
  PUSH_URL_MAX_LENGTH,
} from '../push-notice';

export class SendPushNoticeDto {
  @ApiProperty({
    example: 'Cambio de horario',
    maxLength: PUSH_TITLE_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PUSH_TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({
    example: 'La premiación empieza a las 5:00 p. m. en el coliseo.',
    maxLength: PUSH_BODY_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PUSH_BODY_MAX_LENGTH)
  body: string;

  @ApiPropertyOptional({
    example: '/',
    description: 'Ruta interna que se abre al tocar el aviso. Por defecto `/`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(PUSH_URL_MAX_LENGTH)
  url?: string;
}
