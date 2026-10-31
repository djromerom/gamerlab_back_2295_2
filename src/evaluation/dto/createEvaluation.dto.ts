import { Type } from 'class-transformer';
import { IsInt, IsString, IsNumber, IsISO8601, IsNotEmpty, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { CreateDetailEvaluationDto } from './createEvaluationDetails.dto';

export class CreateEvaluationDto {
    // M8: la fecha la fija el servidor; se acepta para no romper al front, pero se ignora.
    @Type(() => IsISO8601)
    @IsOptional()
    @IsISO8601()
    date?: string;

    @Type(() => String)
    @IsString()
    @IsOptional()
    comments: string;

    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    videogameId: number;

    @IsArray()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    details: CreateDetailEvaluationDto[];

}
