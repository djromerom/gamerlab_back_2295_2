import { PartialType } from '@nestjs/mapped-types';
import { MemberDto } from 'src/teams/dto/member.dto';

export class UpdateMemberDto extends PartialType(MemberDto) {}
