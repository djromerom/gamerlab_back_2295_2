import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional } from 'class-validator';
import { MemberDto } from 'src/teams/dto/member.dto';

export class UpdateMemberDto extends PartialType(MemberDto) {
  @IsNumber()
  @IsOptional()
  id?: number;
}
