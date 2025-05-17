import { IsString, IsNotEmpty } from 'class-validator';

export class ReportSubjectDto {
  @IsString()
  @IsNotEmpty()
  subjectName: string;
}