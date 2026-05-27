import { Type } from 'class-transformer';
import { IsString, IsOptional, MaxLength, IsInt, IsBoolean} from 'class-validator';

export class UpdateHistoricalTeamDto {
    //Validaciones para la actualización de equipos históricos
    @Type(() => String)
    @IsOptional()
    @IsString()
    @MaxLength(50, 
        { message: 'Team name must be at most 50 characters long'},
    )
    teamName?: string;

    @Type(() => Number)
    @IsOptional()
    @IsInt()
    editionId?: number;

    @Type(() => Boolean)
    @IsOptional()
    @IsBoolean()
    isExternal?: boolean;

    @Type(() => String)
    @IsOptional()
    @IsString()
    @MaxLength(12, 
        { message: 'Team code must be at most 12 characters long'},
    )
    teamCode?: string;
}
