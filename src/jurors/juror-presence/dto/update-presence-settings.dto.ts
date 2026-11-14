import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** HU-23: cambia uno o varios parámetros de la edición activa (en minutos). */
export class UpdatePresenceSettingsDto {
  @ApiPropertyOptional({
    example: 60,
    minimum: 10,
    maximum: 240,
    description: 'Cada cuánto se pregunta "¿Sigues en la feria?"',
  })
  @IsOptional()
  @IsInt({ message: 'promptEveryMinutes debe ser un número entero' })
  @Min(10, { message: 'promptEveryMinutes debe ser al menos 10' })
  @Max(240, { message: 'promptEveryMinutes no puede superar 240' })
  promptEveryMinutes?: number;

  @ApiPropertyOptional({
    example: 15,
    minimum: 1,
    maximum: 120,
    description:
      'Minutos para responder antes de quedar "presencia sin confirmar"',
  })
  @IsOptional()
  @IsInt({ message: 'responseWindowMinutes debe ser un número entero' })
  @Min(1, { message: 'responseWindowMinutes debe ser al menos 1' })
  @Max(120, { message: 'responseWindowMinutes no puede superar 120' })
  responseWindowMinutes?: number;

  @ApiPropertyOptional({
    example: 45,
    minimum: 10,
    maximum: 240,
    description:
      'Minutos sin guardar ni enviar evaluaciones para quedar "posible salida"',
  })
  @IsOptional()
  @IsInt({ message: 'inactivityMinutes debe ser un número entero' })
  @Min(10, { message: 'inactivityMinutes debe ser al menos 10' })
  @Max(240, { message: 'inactivityMinutes no puede superar 240' })
  inactivityMinutes?: number;
}
