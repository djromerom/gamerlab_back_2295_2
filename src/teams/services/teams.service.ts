// src/teams/services/teams.service.ts
import { withoutScoreBreakdown } from '../final-score-breakdown';
import { toPublicPodium } from '../public-podium';
import {
  Injectable,
  Optional,
  Logger,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateMemberEmailDto } from '../dto/update-member-email.dto';
import { RegisterUserDto } from '../dto/register-user.dto';
import { TeamRepository } from '../repositories/team.repository';
import { RecaptchaService } from './recaptcha.service';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { ValidateStudentCodesDto } from '../dto/validate-student-codes.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { Member, Team, User, EditionStatus } from '@prisma/client';
import { AppUser } from '../../auth/jwt.strategy';
import { MemberDto } from '../dto/member.dto';
import { ROLE_IDS } from '../../auth/constants/roles';
import { SettingsService } from '../../settings/settings.service';
import { stripPersonalData } from '../../common/utils/strip-personal-data';
import { BlobReferenceService } from '../../upload/blob-reference.service';
import {
  filterTeamForAudience,
  isTeamLeaderOrMember,
  resolveTeamAudience,
} from '../team-visibility';
import { RankingService } from '../../ranking/ranking.service';
import { AssignmentPushNotifier } from '../../push-notifications/assignment-push-notifier.service';
import { ReleasedJuror, rejectionNotice } from '../team-status';
import { resolveListEdition } from '../../editions/list-edition';
import { TeamListFilters } from '../repositories/team-list-filter';
import { assertTeamWritable, findActiveEdition } from '../../editions/active-edition';
import {
  assertAdminOnly,
  assertStudentEditWindowOpen,
  assertStudentTeamPatch,
  loadTeamEditSnapshot,
  studentEditNeedsReview,
} from '../student-edit-policy';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly teamRepository: TeamRepository,
    private readonly recaptchaService: RecaptchaService,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly blobRefs: BlobReferenceService,
    private readonly ranking: RankingService,
    @Optional() private readonly pushNotifier?: AssignmentPushNotifier,
  ) { }

  /** Task 28: la BD guarda `upload:<id>`; lo que llega como URL firmada se convierte antes de guardar. */
  private async withBlobReferences<T extends { videogame?: any }>(dto: T, teamId?: number): Promise<T> {
    if (!dto?.videogame) return dto;
    const current =
      teamId === undefined
        ? null
        : await this.prisma.videogame.findUnique({
            where: { teamId },
            select: { logoUrl: true, gameFileUrl: true, additionalImages: true },
          });
    return { ...dto, videogame: await this.blobRefs.referenceVideogameFields(dto.videogame, current) };
  }

  /** Respuesta de createTeam: el videojuego recien creado se devuelve con URL firmadas, nunca `upload:<id>`. */
  private async withSignedCreated<T extends { videogame: any }>(created: T): Promise<T> {
    return { ...created, videogame: await this.blobRefs.resolveVideogame(created.videogame) };
  }

  /** Task 28: firma al leer los archivos referenciados del videojuego de cada equipo. */
  private async withSignedBlobs<T>(teams: T[]): Promise<T[]> {
    return this.blobRefs.resolveTeamsVideogames(teams as any) as Promise<T[]>;
  }

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

  /**
   * Ranking público (`GET /teams/final-score/by-n/:n`). HU-48 (ARK-306): para todos, también el
   * Administrador, devuelve solo el podio (3 primeros) de cada nivel y sin notas
   * (`toPublicPodium`); `all` trae el podio de todos los niveles. El ranking completo con notas
   * está en `GET /ranking` (`/tiebreaker`). Con el ranking oculto responde [] salvo al Administrador.
   */
  async getFinalScoreByTeamCodePrefix(prefix: string, user?: AppUser): Promise<any[]> {
    if (!prefix || typeof prefix !== 'string') {
      throw new BadRequestException('Invalid prefix');
    }

    // Contrato de by-n: con el ranking oculto responde [] (no 403) salvo al Administrador
    try {
      await this.assertRankingVisible(user);
    } catch (e) {
      if (e instanceof ForbiddenException) return [];
      throw e;
    }

    const client: any = (this.prisma as any).teamFinalScore;

    try {
      const activeEdition = await findActiveEdition(this.prisma);

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
        return toPublicPodium(
          await this.signRankingLogos(
            await this.ranking.orderRows(rows, activeEdition.id),
          ),
        );
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

      return toPublicPodium(
        await this.signRankingLogos(
          await this.ranking.orderRows(enrichedRows, activeEdition.id),
        ),
      );
    } catch (error) {
      this.logger.error(`Error fetching final scores by prefix ${prefix}: ${error}`);
      throw new InternalServerErrorException('Failed to fetch final scores by prefix');
    }
  }

  /** Task 28: el ranking arrastra `logoUrl` del videojuego; si es una referencia se firma al leer. */
  private async signRankingLogos(rows: any[]): Promise<any[]> {
    return this.blobRefs.resolveKeys(rows, ['logoUrl', 'videogameLogoUrl']);
  }

  async validateEmails(validateEmailsDto: ValidateEmailsDto) {
    return await this.teamRepository.checkEmailsExist(validateEmailsDto.emails);
  }

  /** Para cada código, si ya lo tiene un integrante de otro equipo. */
  async validateStudentCodes(
    dto: ValidateStudentCodesDto,
  ): Promise<{ [studentCode: string]: boolean }> {
    const existing = await this.teamRepository.findExistingStudentCodes([
      ...new Set(dto.studentCodes),
    ]);
    const result: { [studentCode: string]: boolean } = {};
    dto.studentCodes.forEach((code) => {
      result[code] = existing.has(code);
    });
    return result;
  }

  /**
   * Todo lo que la inscripción pública puede revisar antes de escribir, con mensajes en
   * español, para que el alumno sepa qué dato corregir.
   */
  private async assertTeamCanBeCreated(createTeamDto: CreateTeamDto) {
    const { members, teamName, videogame } = createTeamDto;

    const seenEmails = new Set<string>();
    const seenCodes = new Set<string>();
    for (const member of members) {
      const email = member.memberEmail.trim().toLowerCase();
      if (seenEmails.has(email)) {
        throw new ConflictException(
          `El correo ${member.memberEmail} está repetido en el equipo.`,
        );
      }
      seenEmails.add(email);

      if (seenCodes.has(member.studentCode)) {
        throw new ConflictException(
          `El código estudiantil ${member.studentCode} está repetido en el equipo.`,
        );
      }
      seenCodes.add(member.studentCode);
    }

    const existingEmails = await this.teamRepository.checkEmailsExist(
      members.map((member) => member.memberEmail),
    );
    const takenEmail = members.find((member) => existingEmails[member.memberEmail]);
    if (takenEmail) {
      throw new ConflictException(
        `El correo ${takenEmail.memberEmail} ya está en uso.`,
      );
    }

    const existingStudentCodes = await this.teamRepository.findExistingStudentCodes(
      [...seenCodes],
    );
    const takenCode = members.find((member) =>
      existingStudentCodes.has(member.studentCode),
    );
    if (takenCode) {
      throw new ConflictException(
        `El código estudiantil ${takenCode.studentCode} ya está registrado en otro equipo.`,
      );
    }

    if (await this.teamRepository.findByTeamName(teamName)) {
      throw new ConflictException(
        `Ya existe un equipo con el nombre "${teamName}".`,
      );
    }

    if (videogame?.vgName && (await this.teamRepository.findByVideogameName(videogame.vgName))) {
      throw new ConflictException(
        `Ya existe un videojuego con el nombre "${videogame.vgName}".`,
      );
    }
  }

  async create(createTeamDto: CreateTeamDto) {
    // En la inscripción pública el logo es obligatorio (decisión del 1 de noviembre). Se
    // revisa antes del captcha para no gastar el token. La creación del admin lo sigue aceptando
    // sin logo. `logoUrl: ""` ya llega como undefined (VideogameDto).
    if (!createTeamDto.videogame?.logoUrl) {
      throw new BadRequestException('El logo del videojuego es obligatorio.');
    }

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

    await this.assertTeamCanBeCreated(createTeamDto);

    // fuera del try: un archivo no válido es un 400, no un 500
    const dtoWithRefs = await this.withBlobReferences(createTeamDto);

    try {
      const result = await this.withSignedCreated(
        await this.teamRepository.createTeam(dtoWithRefs),
      );

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
          `El correo ${firstMember.memberEmail} ya está registrado.`,
        );
      }

      if (errorMessage.toLowerCase().includes('team already exists')) {
        throw new ConflictException(
          'Ya existe un equipo con esta información.',
        );
      }

      // Los 400/404/409 del repositorio (NRC no encontrado, correo en uso…) llegan tal cual
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `No se pudo registrar el equipo: ${errorMessage}`,
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

    return this.withSignedCreated(
      await this.teamRepository.createTeam(
        await this.withBlobReferences(createTeamDto),
      ),
    );
  }

  async registerUser(registerDto: RegisterUserDto) {
    const authRegisterPayload = {
      email: registerDto.email,
      name: registerDto.name,
    };

    return await this.authService.registerUser(authRegisterPayload);
  }

  /**
   * @param includePersonalData true only when the caller has the Administrador role (the controller
   * resolves it with OptionalAdminRoleGuard). Everyone else, logged in or not, gets the list without
   * member emails, student codes or leader email (BG-02). ListTeams is not enough: Estudiante has it.
   */
  /**
   * ARK-129 (HU-26): solo la edición pedida o, por defecto, la activa. Sin edición activa la
   * lista sale vacía (no se mezclan ediciones). 404 si `editionId` no existe.
   */
  async findAll(sortByLikes: boolean, includePersonalData = false, currentUserId?: string, editionId?: number, filters: TeamListFilters = {}) {
    const edition = await resolveListEdition(this.prisma, editionId);
    if (!edition) return [];
    const teams = await this.withSignedBlobs(
      await this.teamRepository.findAll(sortByLikes, edition.id, filters),
    );
    const visible = includePersonalData ? teams : stripPersonalData(teams);
    return await this.markOwnTeams(visible, currentUserId);
  }

  /**
   * ARK-112: un estudiante solo lee su propio equipo (líder o integrante activo); los demás
   * roles con `GetTeam` lo reciben sin datos personales. Ver `team-visibility.ts`.
   */
  async findOne(id: number, user: AppUser): Promise<unknown> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid team id');
    }

    const team = await this.teamRepository.findOne(id);

    if (!team) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }

    // El administrador no necesita la consulta de integrantes: lo ve todo igual
    const ownsTeam =
      user.roleId === ROLE_IDS.ADMIN ||
      team.userId === user.id ||
      (!!user.email &&
        (await this.teamRepository.isActiveMember(team.id, user.email)));

    return filterTeamForAudience(team, resolveTeamAudience(user, ownsTeam));
  }

  async findOneWithDetails(
    identifier: string,
    user: AppUser,
  ): Promise<unknown> {
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

    // ARK-112: el detalle incluye correos y códigos estudiantiles. Un estudiante solo lo ve
    // si es el líder o un integrante activo del equipo (el repositorio ya trae solo los activos).
    const memberEmails = ((team.members ?? []) as { email: string }[]).map(
      (m) => m.email,
    );
    const audience = resolveTeamAudience(
      user,
      isTeamLeaderOrMember(user, team, memberEmails),
    );

    const [signed] = await this.withSignedBlobs([team]);
    return filterTeamForAudience(signed, audience);
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

    // ARK-130 (HU-27): los equipos de ediciones anteriores son de solo lectura
    await assertTeamWritable(this.prisma, id);

    const { data, markPending } = await this.checkStudentTeamEdit(
      id,
      updateTeamDto,
      isAdmin,
    );
    const result = await this.teamRepository.update(
      id,
      data,
      markPending,
      isAdmin ? currentUser.id : undefined,
    );
    if (result && 'updatedVideogame' in result) {
      const { juradosRetirados = [], ...updated } = result;
      this.notifyReleasedJurors(juradosRetirados);
      updated.updatedVideogame = await this.blobRefs.resolveVideogame(
        updated.updatedVideogame,
      );
      return { ...updated, ...rejectionNotice(juradosRetirados) };
    }
    return result;
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

    await assertTeamWritable(this.prisma, id);

    const { data, markPending } = await this.checkStudentTeamEdit(
      id,
      updateTeamDto,
      isAdmin,
    );
    const updated = await this.teamRepository.updateTeamInfo(
      id,
      data,
      markPending,
      isAdmin ? currentUser.id : undefined,
    );
    if (!updated) return updated;
    const { juradosRetirados = [], ...updatedTeam } = updated;
    this.notifyReleasedJurors(juradosRetirados);
    const [signed] = await this.withSignedBlobs([updatedTeam]);
    return { ...signed, ...rejectionNotice(juradosRetirados) };
  }

  /** BG-35 (ARK-158): avisa por push después de confirmar la transacción, sin esperar el envío. */
  private notifyReleasedJurors(released: ReleasedJuror[] = []) {
    if (released.length > 0) {
      this.pushNotifier?.notifyAssignmentChanged(released.map((j) => j.id));
    }
  }

  /**
   * ARK-161 (BG-38): un estudiante solo edita el nombre del equipo y el contenido del juego,
   * y solo con las inscripciones abiertas (403 en otro caso). Devuelve los datos con el logo
   * como referencia y si el juego vuelve a PENDIENTE (solo si cambia el nombre o el logo).
   */
  private async checkStudentTeamEdit(
    id: number,
    dto: UpdateTeamDto,
    isAdmin: boolean,
  ): Promise<{ data: UpdateTeamDto; markPending: boolean }> {
    if (isAdmin)
      return { data: await this.withBlobReferences(dto, id), markPending: false };

    const current = await loadTeamEditSnapshot(this.prisma, id);
    assertStudentTeamPatch(dto, current);
    await assertStudentEditWindowOpen(this.prisma);
    const data = await this.withBlobReferences(dto, id);
    return { data, markPending: studentEditNeedsReview(data, current) };
  }

  /** ARK-161 (BG-38): el correo de un integrante lo cambia solo el administrador. */
  async updateMemberEmail(
    teamId: number,
    memberId: number,
    updateMemberEmailDto: UpdateMemberEmailDto,
    user: AppUser,
  ) {
    assertAdminOnly(user, 'el correo de un integrante');
    const team = await this.teamRepository.findOne(teamId);

    if (!team) {
      throw new NotFoundException(`Equipo con ID ${teamId} no encontrado`);
    }

    await assertTeamWritable(this.prisma, teamId);

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

  /**
   * ARK-132 (BG-19): equipos confirmados con menos de 3 jurados, solo de la edición pedida o, por
   * defecto, de la activa (sin edición activa, lista vacía). 404 si `editionId` no existe.
   */
  async getTeamsWithLessThanThreeJurors(editionId?: number): Promise<any[]> {
    const edition = await resolveListEdition(this.prisma, editionId);
    if (!edition) return [];
    return this.teamRepository.getTeamsWithLessThanThreeJurors(edition.id);
  }

  /**
   * ARK-154 (HU-30): las tres rutas `final-score/*` quitan `avgJunior` y `avgSenior` a quien no
   * es Administrador, Profesor ni Jurado (`withoutScoreBreakdown`).
   *
   * Con `showRanking=false` solo el Administrador puede ver las notas finales.
   * `by-n/:n` también pasa por aquí, pero convierte el Forbidden en `[]` (su contrato).
   */
  private async assertRankingVisible(user?: AppUser): Promise<void> {
    if (user?.roleId === ROLE_IDS.ADMIN) return;
    if (!(await this.settingsService.isRankingVisible())) {
      throw new ForbiddenException('El ranking no está disponible');
    }
  }

  async getFinalScoreByVideogame(videogameId: number, user?: AppUser): Promise<any[] | null> {
    if (!Number.isInteger(videogameId) || videogameId <= 0) {
      throw new BadRequestException('Invalid videogame id');
    }
    await this.assertRankingVisible(user);

    const client: any = (this.prisma as any).teamFinalScore;

    return withoutScoreBreakdown(
      await this.signRankingLogos(await client.findMany({ where: { videogameId } })),
      user,
    );
  }

  async getFinalScoreByTeam(teamId: number, user?: AppUser): Promise<any[] | null> {
    if (!Number.isInteger(teamId) || teamId <= 0) {
      throw new BadRequestException('Invalid team id');
    }
    await this.assertRankingVisible(user);

    const client: any = (this.prisma as any).teamFinalScore;

    return withoutScoreBreakdown(
      await this.signRankingLogos(await client.findMany({ where: { teamId } })),
      user,
    );
  }

  /** Igual que `findAll`, paginado; incluye `edition` (con `readOnly`) para el selector del admin. */
  async findPaged(page: number, limit: number, sortByLikes: boolean, includePersonalData = false, currentUserId?: string, editionId?: number, filters: TeamListFilters = {}) {
    const edition = await resolveListEdition(this.prisma, editionId);
    if (!edition) {
      return {
        data: [],
        metaData: {
          totalItems: 0,
          totalPages: 0,
          itemsPerPage: Math.max(limit, 1),
          currentPage: Math.max(page, 1),
          itemsOnCurrentPage: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
        edition: null,
      };
    }
    const result = await this.teamRepository.findPaged(page, limit, sortByLikes, edition.id, filters);
    result.data = await this.withSignedBlobs(result.data);
    const visible = includePersonalData ? result : stripPersonalData(result);
    return { ...visible, data: await this.markOwnTeams(visible.data, currentUserId), edition };
  }

  /**
   * Con sesión, agrega `isMine` (el usuario autenticado es el líder). Sin sesión no agrega nada.
   * Reemplaza al cruce `team.userId === user.id` que hacía el front con el UUID del líder.
   * ARK-128: el líder puede tener equipos de ediciones anteriores; "mi equipo" es solo el de la
   * edición activa (el panel del estudiante no debe mostrar el de la edición pasada).
   */
  private async markOwnTeams<T extends { userId?: string; editionId?: number }>(
    teams: T[],
    currentUserId?: string,
  ) {
    if (!currentUserId) return teams;
    const activeEditionId = (await findActiveEdition(this.prisma))?.id;
    return teams.map((team) => ({
      ...team,
      isMine:
        team.userId === currentUserId &&
        activeEditionId !== undefined &&
        team.editionId === activeEditionId,
    }));
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

    // ARK-130: no se borra un equipo de una edición anterior (lo necesitan reportes e historial)
    await assertTeamWritable(this.prisma, id);

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

  /**
   * BG-01: el permiso `UpdateTeam` lo tienen los estudiantes, por lo que sin esta
   * verificación podrían tocar cualquier equipo. Solo el líder o un administrador.
   */
  /** ARK-161 (BG-38): agregar o quitar integrantes lo hace solo el administrador. */
  private async assertAdminForMembers(
    teamId: number,
    user: AppUser,
  ): Promise<void> {
    assertAdminOnly(user, 'los integrantes');
    const team = await this.teamRepository.findOne(teamId);

    if (!team) {
      throw new NotFoundException(`Equipo con ID ${teamId} no encontrado`);
    }
  }

  async addMember(
    id: number,
    memberDto: MemberDto,
    user: AppUser,
  ): Promise<Member | undefined> {
    await this.assertAdminForMembers(id, user);
    await assertTeamWritable(this.prisma, id);
    return await this.teamRepository.addMember(id, memberDto);
  }

  async deleteMember(
    teamId: number,
    memberId: number,
    user: AppUser,
  ): Promise<{ message: string; member: Member | null } | undefined> {
    await this.assertAdminForMembers(teamId, user);
    await assertTeamWritable(this.prisma, teamId);
    return await this.teamRepository.deleteMember(teamId, memberId);
  }
}