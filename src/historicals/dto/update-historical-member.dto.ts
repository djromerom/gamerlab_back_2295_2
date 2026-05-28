import { Type } from 'class-transformer';
import { IsString, IsOptional, IsNotEmpty, MaxLength, IsInt} from 'class-validator';

export class UpdateHistoricalMemberDto {
    //Validaciones para la actualización de miembros históricos
    @Type(() => String)
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    firstName: string;

    @Type(() => String)
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    lastName: string;

    @Type(() => String)
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    email: string;

    @Type(() => String)
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    studentCode: string;

    @Type(() => Number)
    @IsOptional()
    @IsInt()
    teamId: number;
}
