import { Type } from 'class-transformer';
import { IsString, IsOptional, IsNotEmpty, MaxLength, IsInt, Min } from 'class-validator';

export class UpdateHistoricalVideogameDto {
    //Validaciones para la actualización de videojuegos históricos
    @Type(() => String)
    @IsString()
    @IsOptional()
    @IsNotEmpty()
    @MaxLength(30)
    name: string;

    @Type(() => String)
    @IsString()
    @IsOptional()
    @IsNotEmpty()
    description?: string;

    @Type(() => String)
    @IsString()
    @IsOptional()
    logoUrl?: string;

    @Type(() => Number)
    @IsInt()
    @IsOptional()
    teamId: number;

    @Type(() => String)
    @IsString()
    @IsOptional()
    repoUrl?: string;

    @Type(() => String)
    @IsString()
    @IsOptional()
    videoUrl?: string;

    @IsOptional()
    additionalImages?: string[];
    
    @Type(() => String)
    @IsString()
    @IsOptional()
    gameFileUrl?: string;

    @Type(() => String)
    @IsString()
    @IsOptional()
    entry?: string;

    @Type(() => Number)
    @IsInt()
    @IsOptional()
    @Min(0)
    likes: number;
}
