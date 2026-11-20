import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { EditionIdDto } from 'src/jurors/juror-edition/dto/edition-id.dto';
import { TIME_PATTERN } from '../fair-schedule';

const TIME_MESSAGE = 'debe tener el formato HH:mm (por ejemplo 10:00)';

export class SaveFairScheduleDto extends EditionIdDto {
  @ApiProperty({ example: '2026-11-26', description: 'Día de la feria' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fairDate debe tener el formato YYYY-MM-DD',
  })
  fairDate!: string;

  @ApiProperty({ example: '08:00', description: 'Hora de inicio (Bogotá)' })
  @Matches(TIME_PATTERN, { message: `startTime ${TIME_MESSAGE}` })
  startTime!: string;

  @ApiProperty({ example: '10:00', description: 'Hora de alerta (Bogotá)' })
  @Matches(TIME_PATTERN, { message: `alertTime ${TIME_MESSAGE}` })
  alertTime!: string;

  @ApiProperty({ example: '11:00', description: 'Hora de control (Bogotá)' })
  @Matches(TIME_PATTERN, { message: `controlTime ${TIME_MESSAGE}` })
  controlTime!: string;

  @ApiProperty({ example: '12:00', description: 'Hora de cierre (Bogotá)' })
  @Matches(TIME_PATTERN, { message: `closeTime ${TIME_MESSAGE}` })
  closeTime!: string;
}
