import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const PUSH_ENDPOINT_MAX_LENGTH = 2048;

/** Las claves de `PushSubscription.toJSON()`: base64url sin relleno (RFC 8291). */
export class PushKeysDto {
  @ApiProperty({ description: 'Clave pública del navegador (65 bytes)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{87}$/, {
    message: 'keys.p256dh no tiene un formato válido',
  })
  p256dh: string;

  @ApiProperty({ description: 'Secreto de autenticación (16 bytes)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22}$/, {
    message: 'keys.auth no tiene un formato válido',
  })
  auth: string;
}

/** Acepta tal cual `subscription.toJSON()`; `expirationTime` se ignora. */
export class SubscribePushDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PUSH_ENDPOINT_MAX_LENGTH)
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}
