// src/teams/dto/create-team.dto.ts
import { IsString, IsNotEmpty, IsEmail} from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del equipo es obligatorio' })
  teamName: string;

  @IsString()
  @IsEmail()
  @IsNotEmpty({ message: 'El correo del integrante es obligatorio' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'El código de estudiante es obligatorio' })
  studentCode: string;

  @IsString()
  @IsNotEmpty({ message: 'El NRC es obligatorio' })
  nrc: string[];

}