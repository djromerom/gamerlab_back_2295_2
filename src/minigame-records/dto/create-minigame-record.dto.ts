import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MinigameGame } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// HU-52 (ARK-315): puntaje que envía la landing al terminar una partida.
// El largo exacto del alias, la pista y el tope se revisan en minigame-record-rules.ts.
export class CreateMinigameRecordDto {
  @ApiProperty({ enum: MinigameGame, example: MinigameGame.ARKAD_JAM })
  @IsEnum(MinigameGame, { message: 'game debe ser ARKADASH o ARKAD_JAM.' })
  game: MinigameGame;

  @ApiPropertyOptional({
    example: 'guitarra-3',
    description:
      'Solo Arkad Jam: <instrumento>-<índice de la canción>. Arkadash no lo lleva.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  track?: string;

  @ApiProperty({
    example: 'PIX',
    description: 'De 1 a 3 caracteres: letras o números, sin groserías.',
  })
  @IsString({ message: 'alias es obligatorio.' })
  @MaxLength(40)
  alias: string;

  @ApiProperty({ example: 12450 })
  @IsInt({ message: 'score debe ser un número entero.' })
  score: number;
}
