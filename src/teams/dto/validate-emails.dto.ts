/* eslint-disable prettier/prettier */
// src/teams/dto/validate-emails.dto.ts
import { IsArray, IsEmail, ArrayMinSize } from 'class-validator';

export class ValidateEmailsDto {
  @IsArray()
  @IsEmail({}, { each: true })
  @ArrayMinSize(1, { message: 'At least one email must be provided' })
  emails: string[];
}
