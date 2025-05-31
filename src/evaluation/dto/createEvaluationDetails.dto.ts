import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsISO8601, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreateDetailEvaluationDto {
    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    criterionId: number;

    @Type(() => Number)
    @IsNumber()
    @IsNotEmpty()
    score: number;

    @Type(() => IsISO8601)
    @IsISO8601()
    @IsNotEmpty()
    createdAt: string;

    @Type(() => IsISO8601)
    @IsISO8601()
    @IsNotEmpty()
    updatedAt: string;

    @IsBoolean()
    @IsNotEmpty()
    isActive: boolean; // Agregar esta propiedad

}