import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PUSH_ENDPOINT_MAX_LENGTH } from './subscribe-push.dto';

export class UnsubscribePushDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PUSH_ENDPOINT_MAX_LENGTH)
  endpoint: string;
}
