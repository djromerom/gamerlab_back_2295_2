import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ScanBadgeDto {
  @ApiProperty({ description: 'Contenido del QR de la escarapela' })
  @IsString()
  @IsNotEmpty({ message: 'El código QR es obligatorio' })
  @MaxLength(64, { message: 'El código QR no es válido' })
  token: string;
}

export class ManualCheckInDto {
  // Sin @IsUUID: hay usuarios antiguos con ids que no son UUID.
  @ApiProperty({ description: 'Id del jurado elegido en la búsqueda' })
  @IsString()
  @IsNotEmpty({ message: 'El id del jurado es obligatorio' })
  @MaxLength(64, { message: 'El id del jurado no es válido' })
  jurorId: string;
}

export class SearchJurorsQueryDto {
  @ApiProperty({ description: 'Nombre o apellido (mínimo 2 caracteres)' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2, { message: 'Escribe al menos 2 caracteres para buscar' })
  @MaxLength(100)
  q: string;
}
