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
import { Member, Team, User } from '@prisma/client';
import { AppUser } from '../../auth/jwt.strategy';
import { MemberDto } from '../dto/member.dto';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly teamRepository: TeamRepository,
    private readonly recaptchaService: RecaptchaService,
    private readonly prisma: PrismaService,
  ) {}

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

    const p = prefix.toUpperCase();

    // Permite que el endpoint reciba "N1" o "N1-".
    const starts = p.endsWith('-') ? p : `${p}-`;

    // Vista de Prisma que expone el puntaje final calculado por equipo/videojuego.
    const client: any = (this.prisma as any).teamFinalScore;

    try {
      const rows: any[] = await client.findMany({
        where: {
          teamCode: {
            startsWith: starts,
          },
        },
      });

      // La vista teamFinalScore puede no traer todos los datos visuales que necesita el frontend.
      // Por eso se revisa si faltan teamName o logoUrl para enriquecer la respuesta.
      const missingTeamName = rows.some(
        (r) => r.teamName === undefined || r.teamName === null,
      );

      const missingLogo = rows.some(
        (r) => r.logoUrl === undefined || r.logoUrl === null,
      );

      // Si la vista ya trae toda la información, aplicamos directamente la lógica de desempate.
      // Importante: el desempate se aplica aquí porque este método sí tiene varios equipos
      // y puede detectar si dos o más tienen el mismo finalScore.
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

      // Se enriquecen las filas con teamName y logoUrl cuando esos campos no vienen desde la vista.
      const enrichedRows = rows.map((r) => {
        const rr = { ...r };

        if ((rr.teamName === undefined || rr.teamName === null) && rr.teamId) {
          const t = teamsMap.get(Number(rr.teamId));

          if (t) {
            rr.teamName = t.teamName ?? t.teamCode ?? null;
          }
        }

        if ((rr.logoUrl === undefined || rr.logoUrl === null) && rr.videogameId) {
          const vg = vgsMap.get(Number(rr.videogameId));

          if (vg) {
            rr.logoUrl = vg.logoUrl ?? null;
          }
        }

        return rr;
      });

      // Después de enriquecer los datos, se aplica la lógica de desempate.
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
        `reCAPTCHA verification error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      throw new UnauthorizedException('Error en la verificación de reCAPTCHA');
    }

    const firstMember = createTeamDto.members[0];

    // Verifica si el correo del primer integrante ya existe.
    const existingEmails = await this.teamRepository.checkEmailsExist([
      firstMember.memberEmail,
    ]);

    if (existingEmails[firstMember.memberEmail]) {
      throw new ConflictException(
        `The email ${firstMember.memberEmail} is already in use.`,
      );
    }

    // Verifica códigos estudiantiles duplicados dentro de la misma petición.
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

  async findAll(sortByLikes: boolean) {
    return this.teamRepository.findAll(sortByLikes);
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
   * Sirve para evitar errores cuando Prisma devuelve valores como string, Decimal o number.
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
   * Fórmula solicitada por el Jira:
   * 70% promedio de jurados + 30% promedio de profesores.
   *
   * Importante:
   * - Esta función NO decide si hay empate.
   * - Solo calcula el puntaje que se debe usar cuando otro método ya detectó empate.
   * - Los profesores se identifican por el rol "Profesor".
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

    // Promedio de calificaciones dadas por profesores.
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

    // Promedio de calificaciones dadas por jurados que NO son profesores.
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

    // Si solo existe calificación docente, se usa esa como desempate.
    if (jurorScore === null) {
      return {
        jurorScore,
        professorScore,
        tieBreakerScore: professorScore,
      };
    }

    // Si solo existe calificación de jurados, se usa esa como desempate.
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
   *
   * Esto cumple el criterio:
   * "Debe almacenarse el resultado final del desempate".
   *
   * Se usa upsert porque el ranking puede recalcularse:
   * - Si no existe el registro, lo crea.
   * - Si ya existe para el mismo equipo, videojuego y edición, lo actualiza.
   */
  private async persistRankingResults(rows: any[]): Promise<void> {
    await Promise.all(
      rows.map(async (row, index) => {
        const teamId = Number(row.teamId ?? row.team_id);
        const videogameId = Number(row.videogameId ?? row.videogame_id);
        const editionId = Number(row.editionId ?? row.edition_id);

        // Si falta algún ID clave, no se puede guardar el resultado.
        // Se omite esa fila para evitar romper todo el ranking.
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
   * Aplica la lógica de desempate sobre un listado de equipos ya rankeables.
   *
   * Pasos:
   * 1. Agrupa equipos por finalScore.
   * 2. Detecta si dos o más equipos tienen el mismo finalScore.
   * 3. Solo a los equipos empatados les calcula tieBreakerScore.
   * 4. Agrega campos informativos para el frontend:
   *    - wasTied
   *    - jurorTieBreakerScore
   *    - professorTieBreakerScore
   *    - tieBreakerScore
   *    - rankingScore
   * 5. Ordena el resultado final usando rankingScore.
   * 6. Guarda el resultado final en resultado_ranking.
   */
  private async applyTieBreakerToRanking(rows: any[]): Promise<any[]> {
    const scoreGroups = new Map<number, any[]>();

    for (const row of rows) {
      const finalScore = this.normalizeScore(
        row.finalScore ?? row.final_score ?? row.finalscore,
      );

      if (finalScore === null) {
        continue;
      }

      if (!scoreGroups.has(finalScore)) {
        scoreGroups.set(finalScore, []);
      }

      scoreGroups.get(finalScore)!.push(row);
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

        // Si el equipo no está empatado, conserva su puntaje original.
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

        // Si por alguna razón no hay videogameId válido, no se puede calcular el desempate.
        // Se mantiene el puntaje base para no romper el ranking.
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
          rankingScore: tieBreaker.tieBreakerScore ?? baseScore,
        };
      }),
    );

    // Ordena de mayor a menor usando rankingScore.
    // Si no hubo empate, rankingScore será igual al finalScore base.
    // Si hubo empate, rankingScore será el tieBreakerScore.
    const sortedRanking = result.sort((a, b) => {
      const scoreA = this.normalizeScore(a.rankingScore) ?? -Infinity;
      const scoreB = this.normalizeScore(b.rankingScore) ?? -Infinity;

      return scoreB - scoreA;
    });

    // Aquí se almacena el resultado final del ranking/desempate en la tabla resultado_ranking.
    await this.persistRankingResults(sortedRanking);

    return sortedRanking;
  }

  async findPaged(page: number, limit: number, sortByLikes: boolean) {
    return await this.teamRepository.findPaged(page, limit, sortByLikes);
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