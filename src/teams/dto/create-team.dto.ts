import {    IsString,
            IsNotEmpty,
            IsEmail,
            IsArray, 
            ValidateNested, 
            IsEmpty} from 'class-validator';
import { Type } from 'class-transformer';

// Members Information
export class MemberDto {

  @IsString()
  memberName: string;  // Split into first name and last name

  @IsEmail()
  //Validar
  memberEmail: string;

  @IsString()
  studentCode: string;

  @IsArray()
  @IsString({ each: true })
  nrc: string[];   // List of NRCs associated with the member

}

// Videogame Information
export class VideogameDto {

    @IsString()
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
    
}