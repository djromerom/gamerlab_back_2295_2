import { IsNotEmpty, IsString, MaxLength, isString } from "class-validator";

export class CheckTeamName {

  @IsString()
  @IsNotEmpty({ message: 'El nombre de equipo es obligatorio' })
  @MaxLength(50, { message: 'El nombre del equipo debe ser de máximo 50 caracteres' })
  teamName: string;
}
