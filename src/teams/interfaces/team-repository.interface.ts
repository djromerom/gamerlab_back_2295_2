// src/teams/interfaces/team-repository.interface.ts
import { Team, Member, Videogame } from '@prisma/client';
import { CreateTeamDto } from '../dto/create-team.dto';

export interface ITeamRepository {
  findByTeamName(teamName: string): Promise<boolean>;
  findByVideogameName(videogameName: string): Promise<boolean>;
  checkEmailsExist(emails: string[]): Promise<{ [email: string]: boolean }>;
  createTeam(createTeamDto: CreateTeamDto): Promise<{
    team: Team;
    members: Member[];
    createdVideogame: Videogame;
  }>;
  findAll(): Promise<Team[]>;
  findOne(id: number): Promise<Team | null>;
  update(id: number, data: any): Promise<Team>;
  remove(id: number): Promise<Team>;
}
