// src/teams/services/teams.service.ts
import {
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { RegisterUserDto } from '../dto/register-user.dto';
import { TeamRepository } from '../repositories/team.repository';
import { RecaptchaService } from './recaptcha.service';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { Team, Member, NRC, Subject, Videogame, User } from '@prisma/client';
import { PaginatedTeams, TeamRowData } from '../types/paginated-teams.type';

type MemberWithNrcs = Member & { nrcs: (NRC & { subject: Subject })[] };
type TeamWithRelations = Team & {
  members: MemberWithNrcs[];
  videogame: Videogame | null;
  externo?: boolean | null;
};

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

    const existingEmails = await this.teamRepository.checkEmailsExist([
      firstMember.memberEmail,
    ]);
    if (existingEmails[firstMember.memberEmail]) {
      throw new ConflictException(
        `The email ${firstMember.memberEmail} is already in use.`,
      );
    }

    const studentCodeMap = new Map<string, boolean>();
    for (const member of createTeamDto.members) {
      if (studentCodeMap.has(member.studentCode)) {
        throw new ConflictException(
          `Duplicate student code: ${member.studentCode} within request`,
        );
      }
      studentCodeMap.set(member.studentCode, true);

      const existingMember = await this.prisma.member.findUnique({
        where: { studentCode: member.studentCode },
      });
      if (existingMember) {
        throw new ConflictException(
          `Student code ${member.studentCode} is already in use.`,
        );
      }
    }

    let user: User;
    try {
      user = await this.authService.registerUser({
        email: firstMember.memberEmail,
      });

      if (!user || !user.id) {
        throw new InternalServerErrorException('User registration failed.');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown registration error';
      if (errorMessage.toLowerCase().includes('user already registered')) {
        throw new ConflictException(
          `Email ${firstMember.memberEmail} is already registered.`,
        );
      }
      throw new InternalServerErrorException(`Error: ${errorMessage}`);
    }

    const result = await this.teamRepository.createTeam(createTeamDto, user.id);

    return result;
  }

  async registerUser(registerDto: RegisterUserDto) {
    const authRegisterPayload = {
      email: registerDto.email,
      name: registerDto.name,
    };

    return this.authService.registerUser(authRegisterPayload);
  }

  async findAll() {
    return this.teamRepository.findAll();
  }

  async findOne(id: number): Promise<unknown> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid team id');
    }
    return await this.teamRepository.findOne(id);
  }

  async update(id: number, updateTeamDto: UpdateTeamDto) {
    return this.teamRepository.update(id, updateTeamDto);
  }

  async findPaged(page: number, limit: number): Promise<PaginatedTeams> {
    if (!page || page < 1) throw new BadRequestException('page must be >= 1');
    if (!limit || limit < 1)
      throw new BadRequestException('limit must be >= 1');

    const totalItems = await this.prisma.team.count();

    const teams = (await this.prisma.team.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { id: 'asc' },
      include: {
        members: {
          include: {
            nrcs: {
              include: { subject: true },
            },
          },
        },
        videogame: true,
      },
    })) as TeamWithRelations[];

    const teamIds = teams.map((t) => t.id);
    const teamIdToFiles = new Map<number, string[]>();

    if (teamIds.length > 0) {
      // Usar $queryRawUnsafe para consultar directamente la tabla archivos_equipo
      // Los IDs son números controlados internamente, así que es seguro usarlos directamente
      const idsString = teamIds.join(',');
      const teamFiles = (await this.prisma.$queryRawUnsafe<
        Array<{ id_equipo: number; id_archivo: string }>
      >(
        `SELECT id_equipo, id_archivo
         FROM archivos_equipo
         WHERE id_equipo IN (${idsString})`,
      )) as Array<{ id_equipo: number; id_archivo: string }>;

      for (const row of teamFiles) {
        const arr = teamIdToFiles.get(row.id_equipo) ?? [];
        arr.push(row.id_archivo);
        teamIdToFiles.set(row.id_equipo, arr);
      }
    }

    const confirmIds = Array.from(
      new Set(teams.map((t) => t.confirmId)),
    ).filter(Boolean);
    const statusById = confirmIds.length
      ? Object.fromEntries(
          (
            await this.prisma.confirmationStatus.findMany({
              where: { id: { in: confirmIds } },
              select: { id: true, status: true },
            })
          ).map((cs) => [cs.id, cs.status]),
        )
      : {};

    const data = teams.map((team) => {
      const integrantes = team.members.map((m) => ({
        id_integrante: m.id,
        nombre: m.firstName,
        apellido: m.lastName,
        correo: m.email,
        codigo_estudiantil: m.studentCode,
        id_equipo: m.teamId,
        activo: m.isActive,
        creado_en: m.createdAt.toISOString(),
        actualizado_en: m.updatedAt.toISOString(),
      }));

      const vg = team.videogame;
      const archivos: string[] = teamIdToFiles.get(team.id) ?? [];

      const videojuego = vg
        ? {
            id_videojuego: vg.id,
            nombre: vg.name,
            descripcion: vg.description ?? '',
            logo_url: vg.logoUrl ?? '',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            video_url: (vg as any).video_url ?? null,
            archivos,
            fecha_registro: vg.registrationDate.toISOString(),
            id_estado_videojuego: vg.videogameStatusId,
            id_equipo: vg.teamId,
            activo: vg.isActive,
          }
        : null;

      const firstMemberWithNrc = team.members.find((m) => m.nrcs.length > 0);

      const nrc = firstMemberWithNrc?.nrcs?.[0];

      const nrc_info = nrc
        ? {
            id_nrc: nrc.id,
            codigo: nrc.code,
            id_materia: nrc.subjectId,
            id_profesor: nrc.professorId,
          }
        : undefined;

      const materia_info = nrc?.subject
        ? {
            id_materia: nrc.subject.id,
            nombre: nrc.subject.name,
            codigo: nrc.subject.code,
            semestre: nrc.subject.semester,
          }
        : undefined;

      return {
        id_equipo: team.id,
        nombre_equipo: team.teamName,
        fecha_registro: team.registrationDate.toISOString(),
        id_usuario: team.userId,
        id_edicion: team.editionId,
        activo: team.isActive,
        id_estado_confirmacion: team.confirmId,
        estado_nombre: statusById[team.confirmId] ?? '',
        externo: Boolean(team.externo ?? false),
        integrantes,
        videojuego: videojuego ?? null,
        nrc_info,
        materia_info,
      };
    }) as unknown as TeamRowData[];

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const itemsOnCurrentPage = data.length;

    return {
      data,
      metadata: {
        totalItems,
        itemsOnCurrentPage,
        currentPage: page,
        itemsPerPage: limit,
        totalPages,
      },
    };
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
}
