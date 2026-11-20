import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MinigameGame } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

// HU-52 (ARK-315): top público. En Arkad Jam, sin track se lista el top de todas las canciones.
export class ListMinigameRecordsDto {
  @ApiProperty({ enum: MinigameGame })
  @IsEnum(MinigameGame, { message: 'game debe ser ARKADASH o ARKAD_JAM.' })
  game: MinigameGame;

  @ApiPropertyOptional({ example: 'piano-0' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  track?: string;
}
