import { Type } from 'class-transformer';
import { IsInt, IsString, IsNumber, IsISO8601, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { CreateDetailEvaluationDto } from './createEvaluationDetails.dto';

export class CreateEvaluationDto {
    @Type(() => IsISO8601)
    @IsISO8601()
    date: string;

    @Type(() => String)
    @IsString()
    @IsOptional()
    comments: string;

    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    videogameId: number;

    @Type(() => Number)
    @IsNumber()
    @IsNotEmpty()
    totalScore: number;

    @IsArray()
    @IsNotEmpty()
    details: CreateDetailEvaluationDto[];


}
