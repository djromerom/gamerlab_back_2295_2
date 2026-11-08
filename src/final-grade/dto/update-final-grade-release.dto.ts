import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateFinalGradeReleaseDto {
  @ApiProperty({
    example: true,
    description: 'true libera la nota final; false la vuelve a ocultar',
  })
  @IsBoolean()
  show: boolean;
}
