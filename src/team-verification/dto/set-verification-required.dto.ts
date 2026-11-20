import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** HU-50 (ARK-314): `false` desactiva el código de verificación del equipo; `true` lo reactiva. */
export class SetVerificationRequiredDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  required: boolean;
}
