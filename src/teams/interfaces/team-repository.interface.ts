// src/teams/interfaces/team-repository.interface.ts
import { Team, Member, Videogame, User } from '@prisma/client';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateMemberDto } from 'src/members/dto/update-member.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';

export interface ITeamRepository {
  findByTeamName(teamName: string): Promise<boolean>;
  findByVideogameName(videogameName: string): Promise<boolean>;
  checkEmailsExist(emails: string[]): Promise<{ [email: string]: boolean }>;
  
  // Overloaded createTeam methods to support both signatures
  createTeam(createTeamDto: CreateTeamDto): Promise<{
    team: Team;
    members: Member[];
    videogame: Videogame;
  }>;
  findAll(): Promise<Team[]>;
  findOne(id: number): Promise<Team | null>;
  findPaged(page: number, limit: number): Promise<any>;
  findOneWithDetails(id: number): Promise<any>;
  findOneWithDetailsByLeaderId(leaderId: string): Promise<any>;
  isActiveMember(teamId: number, email: string): Promise<boolean>;
  
  // Overloaded update methods to support both signatures  
  update(id: number, data: UpdateTeamDto, isAdmin: boolean): Promise<{
    updatedTeam: Team | null;
    updatedMembers: UpdateMemberDto[] | null;
    updatedVideogame: Videogame | null;
  }>;
  update(id: number, data: any, isAdmin: boolean): Promise<Team>;
  
  updateTeamInfo(teamId: number, updateTeamDto: UpdateTeamDto, isAdmin: boolean): Promise<any>;
  updateMemberEmail(memberId: number, newEmail: string, teamId: number): Promise<Member>;
  
  remove(id: number): Promise<Team>;
  
  // Additional methods
  getLeaderStatus(email: string): Promise<any>;
  findExistingStudentCodes(studentCodes: string[]): Promise<Set<string>>;
  findMemberById(memberId: number): Promise<Member | null>;
  findUserById(userId: string): Promise<User | null>;
  getTeamsWithLessThanThreeJurors(): Promise<Array<any>>;
}
