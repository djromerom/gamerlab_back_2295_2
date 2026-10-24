import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyTeamDto {
  @ApiProperty({ example: 12, description: 'Id del equipo a calificar' })
  @Type(() => Number)
  @IsInt()
  teamId: number;

  @ApiProperty({
    example: 'K7M2QX',
    description: 'Código que el estudiante ve en su panel',
  })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @Length(6, 8)
  code: string;
}
