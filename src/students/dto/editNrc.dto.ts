import { IsArray, IsInt, ArrayNotEmpty, ArrayMinSize } from 'class-validator';

export class EditNrcDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1, { message: 'El integrante debe pertenecer a al menos un Nrc' })
  @IsInt({ each: true })
  nrcCodes: number[];
}
