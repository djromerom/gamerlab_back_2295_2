import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';
export class VerifyTokenDto {

  @IsNotEmpty({ message: 'A token is required' })
  @IsUUID()
  token: string;

  @IsOptional()
  @IsString()
  type?: string = "VERIFICACION_EMAIL";
}
