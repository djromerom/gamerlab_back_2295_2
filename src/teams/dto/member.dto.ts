/* eslint-disable prettier/prettier */
// src/teams/dto/member.dto.ts
import { IsString, IsNotEmpty, IsEmail, IsArray, Matches } from 'class-validator';

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
  nrc: string[];
}