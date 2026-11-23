import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** HU-50 (ARK-314): «Exigir código de verificación a los jurados». */
export class UpdateVerificationCodesDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  enabled: boolean;
}
