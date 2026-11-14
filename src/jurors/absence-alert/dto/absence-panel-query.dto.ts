import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  JUROR_ATTENDANCE_STATES,
  JurorAttendanceState,
} from '../absence-alert.types';

export class AbsencePanelQueryDto {
  @ApiPropertyOptional({
    enum: JUROR_ATTENDANCE_STATES,
    description:
      'Deja en cada grupo solo a los jurados con este estado y quita los grupos que queden sin jurados',
  })
  @IsOptional()
  @IsIn(JUROR_ATTENDANCE_STATES, {
    message: `attendance debe ser uno de: ${JUROR_ATTENDANCE_STATES.join(', ')}`,
  })
  attendance?: JurorAttendanceState;
}
