import { IsBoolean, IsInt, IsOptional, Min, IsString, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportSubjectDto {
  @Type(() => String)
  @IsNotEmpty()
  subjectName: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'includeInactive must be a boolean value (true or false).' })
  includeInactive: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer.' })
  @Min(1, { message: 'Limit must be at least 1.' })
  limit: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer.' })
  @Min(1, { message: 'Page must be at least 1.' })
  page: number = 1;
}