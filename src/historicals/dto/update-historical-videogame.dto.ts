import { Transform, Type } from 'class-transformer';
import { IsString, IsOptional, IsNotEmpty, MaxLength, IsInt, Min, IsBoolean } from 'class-validator';

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

    // TA-36 (ARK-326): se puede jugar en celular. Se valida el valor original (sin conversión implícita).
    @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
    @IsBoolean({ message: 'allowMobile debe ser true o false' })
    @IsOptional()
    allowMobile?: boolean;
}
