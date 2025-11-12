/* eslint-disable prettier/prettier */
// src/teams/interfaces/team-repository.interface.ts
import { Team, Member, Videogame, User } from '@prisma/client';
import { CreateTeamDto } from '../dto/create-team.dto';

export interface ITeamRepository {
  findByTeamName(teamName: string): Promise<boolean>;
  findByVideogameName(videogameName: string): Promise<boolean>;
  checkEmailsExist(emails: string[]): Promise<{ [email: string]: boolean }>;
  createTeam(createTeamDto: CreateTeamDto, userId: string): Promise<{
    createdUser: User;
    team: Team;
    members: Member[];
    createdVideogame: Videogame;
  }>;
  findAll(): Promise<Team[]>;
  findOne(id: number): Promise<Team>;
  findOneWithDetails(id: number): Promise<any>;
  findOneWithDetailsByLeaderId(leaderId: string): Promise<any>;
  update(id: number, data: any): Promise<Team>;
  updateTeamInfo(
    teamId: number,
    updateData: {
      teamName?: string;
      videogameName?: string;
      description?: string;
      videoUrl?: string | null;
      logoUrl?: string | null;
      repoUrl?: string | null;
      additionalImages?: string[];
    },
  ): Promise<any>;
  remove(id: number): Promise<Team>;
}