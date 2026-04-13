import {
  IsArray,
  IsInt,
  ArrayNotEmpty,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class EditNrcDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1, {
    message: 'El integrante debe pertenecer a al menos un Nrc',
  })
  @ArrayMaxSize(2, {
    message: 'El integrante debe pertenecer a un máximo de 2 Nrcs',
  })
  @IsInt({ each: true })
  nrcCodes: number[];
}
