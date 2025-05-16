// src/members/dto/create-member.dto.ts
import { IsString, IsEmail, IsNotEmpty } from 'class-validator';

export class CreateMemberDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  studentCode: string;
}
