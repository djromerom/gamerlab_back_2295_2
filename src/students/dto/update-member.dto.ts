import { IsNotEmpty, IsArray } from 'class-validator';
export class UpdateMemberDto {
  @IsNotEmpty({ message: 'You must provide the current list of nrcs' })
  @IsArray()
  currentNrcs: number[];

  @IsNotEmpty({ message: 'You must provide the new list of nrcs ' })
  @IsArray()
  newNrcs: number[];
}
