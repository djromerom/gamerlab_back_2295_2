/* eslint-disable prettier/prettier */
// src/teams/interfaces/team-repository.interface.ts
import { Team, Member, Videogame, User } from '@prisma/client';
import { CreateTeamDto } from '../dto/create-team.dto';

export interface ITeamRepository {
  findByTeamName(teamName: string): Promise<boolean>;
  findByVideogameName(videogameName: string): Promise<boolean>;
  checkEmailsExist(emails: string[]): Promise<{ [email: string]: boolean }>;
  createTeam(createTeamDto: CreateTeamDto, supabaseUserId: string): Promise<{
    createdUser: User;
    team: Team;
    members: Member[];
    createdVideogame: Videogame;
  }>;
  findAll(): Promise<Team[]>;
  findOne(id: number): Promise<Team>;
  update(id: number, data: any): Promise<Team>;
  remove(id: number): Promise<Team>;
}