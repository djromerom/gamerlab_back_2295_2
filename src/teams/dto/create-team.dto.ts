import {    IsString,
            IsNotEmpty,
            IsEmail,
            IsArray, 
            ValidateNested, 
<<<<<<< HEAD
            Matches } from 'class-validator';
=======
            IsEmpty} from 'class-validator';
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
import { Type } from 'class-transformer';

// Members Information
export class MemberDto {

  @IsString()
<<<<<<< HEAD
  @IsNotEmpty({ message: 'El nombre del integrante es obligatorio' })
  memberName: string;  // Split into first name and last name

  @IsEmail()
  @IsNotEmpty({ message: 'El correo del integrante es obligatorio' })
  @Matches(/^[\w.+-]+@uninorte\.edu\.co$/, {
    message: 'El correo debe ser institucional (@uninorte.edu.co)',
  })
  memberEmail: string;

  @IsString()
  @IsNotEmpty({ message: 'El código de estudiante es obligatorio' })
=======
  memberName: string;  // Split into first name and last name

  @IsEmail()
  //Validar
  memberEmail: string;

  @IsString()
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
  studentCode: string;

  @IsArray()
  @IsString({ each: true })
<<<<<<< HEAD
  @IsNotEmpty({ message: 'El NRC es obligatorio' })
=======
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
  nrc: string[];   // List of NRCs associated with the member

}

// Videogame Information
export class VideogameDto {

    @IsString()
<<<<<<< HEAD
    @IsNotEmpty({ message: 'El nombre del videojuego es obligatorio' })
=======
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
    vgName: string;  // Nombre del videojuego
    
    @IsString()
    description: string;  // Videogame description
    
    @IsString()
    logoURL: string;  // Logo URL of the videogame

}

export class CreateTeamDto {

    // Team information
    @IsString()
    @IsNotEmpty({ message: 'El nombre del equipo es obligatorio' })
    teamName: string;  // --> Username of the team

    //Members List
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MemberDto)
    members: MemberDto[];   // List of members in the team

    // User information (members[0].name, mebers[0].email)

    //Videogame information
    @ValidateNested()
    @Type(() => VideogameDto)
    videogame: VideogameDto;  // Videogame information
    
<<<<<<< HEAD
}
=======
}
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
