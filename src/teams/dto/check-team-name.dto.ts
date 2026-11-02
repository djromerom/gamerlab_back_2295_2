import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { trimString } from "../../common/utils/trim-transform";

export class CheckTeamName {

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El nombre de equipo es obligatorio' })
  @MaxLength(50, { message: 'El nombre del equipo debe ser de máximo 50 caracteres' })
  teamName: string;
}
