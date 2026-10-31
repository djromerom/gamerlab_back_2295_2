import { IsBoolean } from 'class-validator';

export class UpdateRegistrationsDto {
  @IsBoolean()
  open: boolean;
}
