import { IsNumberString, IsNotEmpty } from 'class-validator';

export class ReportNrcDto {
  @IsNumberString() 
  @IsNotEmpty()
  nrcCode: string;
}