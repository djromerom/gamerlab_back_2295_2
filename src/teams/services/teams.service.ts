// src/teams/services/teams.service.ts
import {
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateMemberEmailDto } from '../dto/update-member-email.dto';
import { RegisterUserDto } from '../dto/register-user.dto';
import { TeamRepository } from '../repositories/team.repository';
import { RecaptchaService } from './recaptcha.service';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { Member, Team, User, EditionStatus } from '@prisma/client';
import { AppUser } from '../../auth/jwt.strategy';
import { MemberDto } from '../dto/member.dto';
import { stripPersonalData } from '../../common/utils/strip-personal-data';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly teamRepository: TeamRepository,
    private readonly recaptchaService: RecaptchaService,
    private readonly prisma: PrismaService,
  ) { }

  async findByTeamName(teamName: string): Promise<any> {
    return await this.teamRepository.findByTeamName(teamName);
  }

  async findByVideogameName(videogameName: string) {
    return await this.teamRepository.findByVideogameName(videogameName);
  }

  async findByTeamCodePrefix(prefix: string) {
    if (!prefix || typeof prefix !== 'string') {
      throw new BadRequestException('Invalid prefix');
    }

    const p = prefix.toUpperCase();

    // Permite buscar con o sin guion final.
    // Ejemplo: si llega "N1", busca equipos que empiecen por "N1-".
    // Si llega "N1-", lo usa directamente.
    const starts = p.endsWith('-') ? p : `${p}-`;

    try {
      return await this.prisma.team.findMany({
        where: {
          teamCode: {
            startsWith: starts,
          },
        },
      });
    } catch (error) {
      this.logger.error(`Error fetching teams by prefix ${prefix}: ${error}`);
      throw new InternalServerErrorException('Failed to fetch teams by prefix');
    }
  }

  async getFinalScoreByTeamCodePrefix(prefix: string): Promise<any[]> {
    if (!prefix || typeof prefix !== 'string') {
      throw new BadRequestException('Invalid prefix');
    }

    const client: any = (this.prisma as any).teamFinalScore;

    try {
      const activeEdition = await this.prisma.edition.findFirst({
        where: { status: EditionStatus.ACTIVE },
        select: { id: true },
      });

      if (!activeEdition) {
        return [];
      }

      const whereClause: any = {
        editionId: activeEdition.id,
      };

      if (prefix.toLowerCase() !== 'all') {
        const p = prefix.toUpperCase();
        const starts = p.endsWith('-') ? p : `${p}-`;

        whereClause.teamCode = {
          startsWith: starts,
        };
      }

      const rows: any[] = await client.findMany({
        where: whereClause,
      });

      const missingTeamName = rows.some(
        (r) => r.teamName === undefined || r.teamName === null,
      );

      const missingLogo = rows.some(
        (r) =>
          (r.logoUrl === undefined || r.logoUrl === null) &&
          (r.videogameLogoUrl === undefined || r.videogameLogoUrl === null),
      );

      if (!missingTeamName && !missingLogo) {
        return this.applyTieBreakerToRanking(rows);
      }

      const teamIds = Array.from(
        new Set(rows.map((r) => Number(r.teamId)).filter(Boolean)),
      );

      const videogameIds = Array.from(
        new Set(rows.map((r) => Number(r.videogameId)).filter(Boolean)),
      );

      const teamsMap = new Map<number, any>();

      if (teamIds.length > 0) {
        const teams = await this.prisma.team.findMany({
          where: {
            id: {
              in: teamIds,
            },
          },
          select: {
            id: true,
            teamName: true,
            teamCode: true,
          },
        });

        teams.forEach((t) => teamsMap.set(t.id, t));
      }

      const vgsMap = new Map<number, any>();

      if (videogameIds.length > 0) {
        const vgs = await this.prisma.videogame.findMany({
          where: {
            id: {
              in: videogameIds,
            },
          },
          select: {
            id: true,
            logoUrl: true,
          },
        });

        vgs.forEach((v) => vgsMap.set(v.id, v));
      }

      const enrichedRows = rows.map((r) => {
        const rr = { ...r };

        if ((rr.teamName === undefined || rr.teamName === null) && rr.teamId) {
          const t = teamsMap.get(Number(rr.teamId));

          if (t) {
            rr.teamName = t.teamName ?? t.teamCode ?? null;
          }
        }

        if (rr.logoUrl === undefined || rr.logoUrl === null) {
          rr.logoUrl = rr.videogameLogoUrl ?? rr.videogame_logo_url ?? null;
        }

        if ((rr.logoUrl === undefined || rr.logoUrl === null) && rr.videogameId) {
          const vg = vgsMap.get(Number(rr.videogameId));

          if (vg) {
            rr.logoUrl = vg.logoUrl ?? null;
          }
        }

        return rr;
      });

      return this.applyTieBreakerToRanking(enrichedRows);
    } catch (error) {
      this.logger.error(`Error fetching final scores by prefix ${prefix}: ${error}`);
      throw new InternalServerErrorException('Failed to fetch final scores by prefix');
    }
  }

  async validateEmails(validateEmailsDto: ValidateEmailsDto) {
    return await this.teamRepository.checkEmailsExist(validateEmailsDto.emails);
  }

  async create(createTeamDto: CreateTeamDto) {
    try {
      const isRecaptchaValid = await this.recaptchaService.verify(
        createTeamDto.recaptchaToken,
      );

      if (!isRecaptchaValid) {
        throw new UnauthorizedException('reCAPTCHA verification failed');
      }
    } catch (error) {
      this.logger.error(
        `reCAPTCHA verification error: ${error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new UnauthorizedException('Error en la verificación de reCAPTCHA');
    }

    const firstMember = createTeamDto.members[0];

    const existingEmails = await this.teamRepository.checkEmailsExist([
      firstMember.memberEmail,
    ]);

    if (existingEmails[firstMember.memberEmail]) {
      throw new ConflictException(
        `The email ${firstMember.memberEmail} is already in use.`,
      );
    }

    const studentCodeMap = new Map<string, boolean>();
    const studentCodes: string[] = [];

    for (const member of createTeamDto.members) {
      if (studentCodeMap.has(member.studentCode)) {
        throw new ConflictException(
          `Duplicate student code: ${member.studentCode} within request`,
        );
      }

      studentCodeMap.set(member.studentCode, true);
      studentCodes.push(member.studentCode);
    }

    const existingStudentCodes =
      await this.teamRepository.findExistingStudentCodes(studentCodes);

    for (const member of createTeamDto.members) {
      if (existingStudentCodes.has(member.studentCode)) {
        throw new ConflictException(
          `Student code ${member.studentCode} is already in use.`,
        );
      }
    }

    try {
      const result = await this.teamRepository.createTeam(createTeamDto);

      this.logger.log(
        `Team created successfully for user: ${firstMember.memberEmail}`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Transaction failed for team creation: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (errorMessage.toLowerCase().includes('user already registered')) {
        throw new ConflictException(
          `Email ${firstMember.memberEmail} is already registered.`,
        );
      }

      if (errorMessage.toLowerCase().includes('team already exists')) {
        throw new ConflictException(
          'A team with this information already exists.',
        );
      }

      throw new InternalServerErrorException(
        `Failed to create team: ${errorMessage}`,
      );
    }
  }

  async createAsAdmin(createTeamDto: CreateTeamDto, user?: AppUser) {
    const isAdmin = user?.roleId === 1;

    if (!isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to access this resource.',
      );
    }

    return await this.teamRepository.createTeam(createTeamDto);
  }

  async registerUser(registerDto: RegisterUserDto) {
    const authRegisterPayload = {
      email: registerDto.email,
      name: registerDto.name,
    };

    return await this.authService.registerUser(authRegisterPayload);
  }

  /**
   * @param includePersonalData true only for callers with the ListTeams permission.
   * Anonymous callers get the list without member emails, student codes or leader email (BG-02).
   */
  async findAll(sortByLikes: boolean, includePersonalData = false) {
    const teams = await this.teamRepository.findAll(sortByLikes);
    return includePersonalData ? teams : stripPersonalData(teams);
  }

  async findOne(id: number): Promise<unknown> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid team id');
    }

    return await this.teamRepository.findOne(id);
  }

  async findOneWithDetails(identifier: string): Promise<unknown> {
    let team =
      await this.teamRepository.findOneWithDetailsByLeaderId(identifier);

    if (!team && /^\d+$/.test(identifier)) {
      const numericId = Number(identifier);
      team = await this.teamRepository.findOneWithDetails(numericId);
    }

    if (!team) {
      throw new NotFoundException(
        `Equipo con líder o ID ${identifier} no encontrado`,
      );
    }

    return team;
  }

  async update(id: number, updateTeamDto: UpdateTeamDto, currentUser: AppUser) {
    const team = await this.teamRepository.findOne(id);

    if (!team) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }

    const isLeader = team.userId === currentUser.id;
    const isAdmin = currentUser.roleId === 1;

    if (!isLeader && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to access this resource.',
      );
    }

    return this.teamRepository.update(id, updateTeamDto, isAdmin);
  }

  async updateTeamInfo(
    id: number,
    updateTeamDto: UpdateTeamDto,
    currentUser: AppUser,
  ) {
    const team = await this.teamRepository.findOne(id);

    if (!team) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }

    const isLeader = team.userId === currentUser.id;
    const isAdmin = currentUser.roleId === 1;

    if (!isLeader && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to access this resource.',
      );
    }

    return this.teamRepository.updateTeamInfo(id, updateTeamDto, isAdmin);
  }

  async updateMemberEmail(
    teamId: number,
    memberId: number,
    updateMemberEmailDto: UpdateMemberEmailDto,
    userId: string,
  ) {
    const team = await this.teamRepository.findOne(teamId);

    if (!team) {
      throw new NotFoundException(`Equipo con ID ${teamId} no encontrado`);
    }

    if (team.userId !== userId) {
      throw new UnauthorizedException(
        'Solo el líder del equipo puede actualizar los emails de los integrantes',
      );
    }

    const member = await this.teamRepository.findMemberById(memberId);

    if (!member) {
      throw new NotFoundException(
        `Integrante con ID ${memberId} no encontrado`,
      );
    }

    if (!member.isActive) {
      throw new BadRequestException('El integrante está inactivo');
    }

    if (member.teamId !== teamId) {
      throw new BadRequestException('El integrante no pertenece a este equipo');
    }

    const leaderUser = await this.teamRepository.findUserById(team.userId);

    if (leaderUser && member.email === leaderUser.email) {
      throw new BadRequestException(
        'No se puede cambiar el email del líder usando este endpoint',
      );
    }

    if (leaderUser && leaderUser.email === updateMemberEmailDto.email) {
      throw new BadRequestException(
        'No se puede usar el email del líder para un integrante',
      );
    }

    try {
      return await this.teamRepository.updateMemberEmail(
        memberId,
        updateMemberEmailDto.email,
        teamId,
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Email already in use') {
          throw new ConflictException('El email ya está en uso');
        }

        if (
          error.message === 'Team not found' ||
          error.message === 'Member not found in team'
        ) {
          throw new NotFoundException(error.message);
        }
      }

      throw new InternalServerErrorException(
        'Error al actualizar el email del integrante',
      );
    }
  }

  async getTeamsWithLessThanThreeJurors(): Promise<any[]> {
    return this.teamRepository.getTeamsWithLessThanThreeJurors();
  }

  async getFinalScoreByVideogame(videogameId: number): Promise<any[] | null> {
    if (!Number.isInteger(videogameId) || videogameId <= 0) {
      throw new BadRequestException('Invalid videogame id');
    }

    const client: any = (this.prisma as any).teamFinalScore;

    return client.findMany({
      where: {
        videogameId,
      },
    });
  }

  async getFinalScoreByTeam(teamId: number): Promise<any[] | null> {
    if (!Number.isInteger(teamId) || teamId <= 0) {
      throw new BadRequestException('Invalid team id');
    }

    const client: any = (this.prisma as any).teamFinalScore;

    return client.findMany({
      where: {
        teamId,
      },
    });
  }

  /**
   * Normaliza cualquier puntaje a número con dos decimales.
   */
  private normalizeScore(value: any): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const score = Number(value);

    if (Number.isNaN(score)) {
      return null;
    }

    return Number(score.toFixed(2));
  }

  /**
   * Calcula el puntaje de desempate de un videojuego.
   *
   * Fórmula:
   * 70% promedio de jurados + 30% promedio de profesores.
   *
   * Esta función solo calcula el puntaje; no decide si hay empate.
   */
  private async getTieBreakerScore(
    videogameId: number,
    editionId?: number,
  ): Promise<{
    jurorScore: number | null;
    professorScore: number | null;
    tieBreakerScore: number | null;
  }> {
    const professorRole = await this.prisma.role.findFirst({
      where: {
        name: 'Profesor',
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!professorRole) {
      return {
        jurorScore: null,
        professorScore: null,
        tieBreakerScore: null,
      };
    }

    const baseWhere: any = {
      videogameId,
      isActive: true,
    };

    if (editionId) {
      baseWhere.editionId = editionId;
    }

    const professorAgg = await this.prisma.evaluation.aggregate({
      _avg: {
        totalScore: true,
      },
      where: {
        ...baseWhere,
        juror: {
          roleId: professorRole.id,
        },
      },
    });

    const jurorAgg = await this.prisma.evaluation.aggregate({
      _avg: {
        totalScore: true,
      },
      where: {
        ...baseWhere,
        juror: {
          roleId: {
            not: professorRole.id,
          },
        },
      },
    });

    const jurorScore = this.normalizeScore(jurorAgg._avg.totalScore);
    const professorScore = this.normalizeScore(professorAgg._avg.totalScore);

    if (jurorScore === null && professorScore === null) {
      return {
        jurorScore,
        professorScore,
        tieBreakerScore: null,
      };
    }

    if (jurorScore === null) {
      return {
        jurorScore,
        professorScore,
        tieBreakerScore: professorScore,
      };
    }

    if (professorScore === null) {
      return {
        jurorScore,
        professorScore,
        tieBreakerScore: jurorScore,
      };
    }

    const tieBreakerScore = Number(
      (jurorScore * 0.7 + professorScore * 0.3).toFixed(2),
    );

    return {
      jurorScore,
      professorScore,
      tieBreakerScore,
    };
  }

  /**
   * Guarda el ranking final calculado en la tabla resultado_ranking.
   */
  private async persistRankingResults(rows: any[]): Promise<void> {
    await Promise.all(
      rows.map(async (row, index) => {
        const teamId = Number(row.teamId ?? row.team_id);
        const videogameId = Number(row.videogameId ?? row.videogame_id);
        const editionId = Number(row.editionId ?? row.edition_id);

        if (
          !Number.isInteger(teamId) ||
          !Number.isInteger(videogameId) ||
          !Number.isInteger(editionId) ||
          teamId <= 0 ||
          videogameId <= 0 ||
          editionId <= 0
        ) {
          return;
        }

        const baseScore = this.normalizeScore(
          row.finalScore ?? row.final_score ?? row.finalscore,
        );

        const rankingScore = this.normalizeScore(row.rankingScore);

        await this.prisma.rankingResult.upsert({
          where: {
            teamId_videogameId_editionId: {
              teamId,
              videogameId,
              editionId,
            },
          },
          update: {
            baseScore: baseScore ?? 0,
            rankingScore: rankingScore ?? 0,
            tieBreakerScore: row.tieBreakerScore,
            jurorTieBreakerScore: row.jurorTieBreakerScore,
            professorTieBreakerScore: row.professorTieBreakerScore,
            wasTied: row.wasTied ?? false,
            finalPosition: index + 1,
          },
          create: {
            teamId,
            videogameId,
            editionId,
            baseScore: baseScore ?? 0,
            rankingScore: rankingScore ?? 0,
            tieBreakerScore: row.tieBreakerScore,
            jurorTieBreakerScore: row.jurorTieBreakerScore,
            professorTieBreakerScore: row.professorTieBreakerScore,
            wasTied: row.wasTied ?? false,
            finalPosition: index + 1,
          },
        });
      }),
    );
  }

  /**
   * Aplica la lógica de desempate sobre un listado de equipos.
   *
   * Correcciones importantes:
   * - Solo compara equipos de la misma edición.
   * - No marca como empatados los equipos sin calificación real.
   * - No aplica desempate si finalScore es 0 o menor.
   */
  private async applyTieBreakerToRanking(rows: any[]): Promise<any[]> {
    const scoreGroups = new Map<string, any[]>();

    for (const row of rows) {
      const finalScore = this.normalizeScore(
        row.finalScore ?? row.final_score ?? row.finalscore,
      );

      const editionId = Number(row.editionId ?? row.edition_id);

      if (
        finalScore === null ||
        finalScore <= 0 ||
        !Number.isInteger(editionId) ||
        editionId <= 0
      ) {
        continue;
      }

      const groupKey = `${editionId}-${finalScore}`;

      if (!scoreGroups.has(groupKey)) {
        scoreGroups.set(groupKey, []);
      }

      scoreGroups.get(groupKey)!.push(row);
    }

    const tiedRows = new Set<any>();

    for (const group of scoreGroups.values()) {
      if (group.length > 1) {
        group.forEach((row) => tiedRows.add(row));
      }
    }

    const result = await Promise.all(
      rows.map(async (row) => {
        const baseScore = this.normalizeScore(
          row.finalScore ?? row.final_score ?? row.finalscore,
        );

        if (!tiedRows.has(row)) {
          return {
            ...row,
            wasTied: false,
            jurorTieBreakerScore: null,
            professorTieBreakerScore: null,
            tieBreakerScore: null,
            rankingScore: baseScore,
          };
        }

        const videogameId = Number(row.videogameId ?? row.videogame_id);
        const editionId = Number(row.editionId ?? row.edition_id);

        if (!Number.isInteger(videogameId) || videogameId <= 0) {
          return {
            ...row,
            wasTied: true,
            jurorTieBreakerScore: null,
            professorTieBreakerScore: null,
            tieBreakerScore: null,
            rankingScore: baseScore,
          };
        }

        const tieBreaker = await this.getTieBreakerScore(
          videogameId,
          Number.isInteger(editionId) && editionId > 0 ? editionId : undefined,
        );

        return {
          ...row,
          wasTied: true,
          jurorTieBreakerScore: tieBreaker.jurorScore,
          professorTieBreakerScore: tieBreaker.professorScore,
          tieBreakerScore: tieBreaker.tieBreakerScore,
          // El puntaje general del ranking se mantiene como el puntaje base.
          // El tieBreakerScore solo se usa para ordenar equipos que ya estaban empatados.
          rankingScore: baseScore,
        };
      }),
    );

    const sortedRanking = result.sort((a, b) => {
      const baseA =
        this.normalizeScore(a.finalScore ?? a.final_score ?? a.finalscore) ??
        -Infinity;

      const baseB =
        this.normalizeScore(b.finalScore ?? b.final_score ?? b.finalscore) ??
        -Infinity;

      // Primero se ordena por puntaje final general.
      if (baseA !== baseB) {
        return baseB - baseA;
      }

      const editionA = Number(a.editionId ?? a.edition_id);
      const editionB = Number(b.editionId ?? b.edition_id);

      // Evita comparar desempates entre ediciones distintas.
      if (editionA !== editionB) {
        return editionA - editionB;
      }

      const tieA = this.normalizeScore(a.tieBreakerScore) ?? baseA;
      const tieB = this.normalizeScore(b.tieBreakerScore) ?? baseB;

      // Solo si el puntaje base es igual, se usa el puntaje de desempate.
      if (tieA !== tieB) {
        return tieB - tieA;
      }

      const codeA = String(a.teamCode ?? a.team_code ?? '');
      const codeB = String(b.teamCode ?? b.team_code ?? '');

      return codeA.localeCompare(codeB);
    });

    await this.persistRankingResults(sortedRanking);

    return sortedRanking;
  }

  async findPaged(page: number, limit: number, sortByLikes: boolean, includePersonalData = false) {
    const result = await this.teamRepository.findPaged(page, limit, sortByLikes);
    return includePersonalData ? result : stripPersonalData(result);
  }

  async getLeaderStatus(email: string) {
    return await this.teamRepository.getLeaderStatus(email);
  }

  async remove(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid team id');
    }

    const team: Team | null = await this.teamRepository.findOne(id);

    if (!team) {
      this.logger.warn(`Delete failed: Team ${id} not found.`);
      throw new NotFoundException(`Team with ID ${id} not found.`);
    }

    try {
      const team = await this.teamRepository.remove(id);

      this.logger.log(`Team ${id} deleted successfully.`);

      return team;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Failed to delete team ${id}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException(`Failed to delete team ${id}.`);
    }
  }

  async addMember(
    id: number,
    memberDto: MemberDto,
    user: User,
  ): Promise<Member | undefined> {
    return await this.teamRepository.addMember(id, memberDto);
  }

  async deleteMember(
    teamId: number,
    memberId: number,
    user: User,
  ): Promise<{ message: string; member: Member | null } | undefined> {
    return await this.teamRepository.deleteMember(teamId, memberId);
  }
}