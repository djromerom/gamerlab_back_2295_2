// src/teams/interfaces/team-repository.interface.ts
import { Team, Member, Videogame } from '@prisma/client';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateMemberDto } from 'src/members/dto/update-member.dto';

export interface ITeamRepository {
  findByTeamName(teamName: string): Promise<boolean>;
  findByVideogameName(videogameName: string): Promise<boolean>;
  checkEmailsExist(emails: string[]): Promise<{ [email: string]: boolean }>;
  createTeam(createTeamDto: CreateTeamDto): Promise<{
    team: Team;
    members: Member[];
    videogame: Videogame;
  }>;
  update(
    id: number,
    data: any,
  ): Promise<{
    updatedTeam: Team | null;
    updatedMembers: UpdateMemberDto[] | null;
    updatedVideogame: Videogame | null;
  }>;
  findAll(): Promise<Team[]>;
  findOne(id: number): Promise<Team | null>;
  remove(id: number): Promise<Team>;
}
