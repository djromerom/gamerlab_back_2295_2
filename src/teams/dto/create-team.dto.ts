import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsArray,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// Members Information
export class MemberDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del integrante es obligatorio' })
  memberFirstName: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido del integrante es obligatorio' })
  memberLastName: string;

  @IsEmail()
  @IsNotEmpty({ message: 'El correo del integrante es obligatorio' })
  @Matches(/^[\w.+-]+@uninorte\.edu\.co$/, {
    message: 'El correo debe ser institucional (@uninorte.edu.co)',
  })
  memberEmail: string;

  @IsString()
  @IsNotEmpty({ message: 'El código de estudiante es obligatorio' })
  studentCode: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'El NRC es obligatorio' })
  nrc: string[]; // List of NRCs associated with the member
}

// Videogame Information
export class VideogameDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del videojuego es obligatorio' })
  vgName: string; // Nombre del videojuego

  @IsString()
  description: string; // Videogame description

  @IsString()
  logoURL: string; // Logo URL of the videogame
}

export class CreateTeamDto {
  // Team information
  @IsString()
  @IsNotEmpty({ message: 'El nombre del equipo es obligatorio' })
  teamName: string; // --> Username of the team

  //Members List
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  members: MemberDto[]; // List of members in the team

  // User information (members[0].name, mebers[0].email)

  //Videogame information
  @ValidateNested()
  @Type(() => VideogameDto)
  videogame: VideogameDto; // Videogame information
}
