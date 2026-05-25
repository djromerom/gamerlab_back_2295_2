import { Type } from 'class-transformer';
import {
	IsString,
	IsOptional,
	IsNotEmpty,
	MaxLength,
	IsInt,
	IsBoolean,
	IsDate,
	Min,
	IsIn,
} from 'class-validator';

export class CreateEditionDto {

	@Type(() => Number)
	@IsInt({
		message: 'El año debe ser un número entero',
	})
	@Min(2000, {
		message: 'El año no es válido',
	})
	year: number;

	@Type(() => Number)
	@IsInt({
		message: 'El semestre debe ser un número entero',
	})
	@IsIn([10, 20, 30], {
		message: 'El semestre debe ser 10, 20 o 30',
	})
	semester: number;
	// 10 = primer semestre
	// 20 = intersemestral
	// 30 = segundo semestre

	@IsString()
	@IsNotEmpty({
		message: 'El título es obligatorio',
	})
	@MaxLength(100, {
		message: 'El título no debe superar los 100 caracteres',
	})
	title: string;

	@Type(() => Date)
	@IsDate({
		message: 'La fecha de inicio no es válida',
	})
	startsAt: Date;

	@Type(() => Date)
	@IsDate({
		message: 'La fecha de finalización no es válida',
	})
	endsAt: Date;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsString()
	description2?: string;

	@IsOptional()
	@IsString()
	@MaxLength(100, {
		message: 'El alt no debe superar los 100 caracteres',
	})
	alt?: string;

}