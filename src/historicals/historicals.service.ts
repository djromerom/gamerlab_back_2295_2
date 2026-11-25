import { Injectable, NotFoundException, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { UpdateHistoricalTeamDto } from './dto/update-historical-team.dto';
import { UpdateHistoricalMemberDto } from './dto/update-historical-member.dto';
import { UpdateHistoricalVideogameDto } from './dto/update-historical-videogame.dto';
import { PrismaService } from '../prisma/prisma.service';
import { BlobReferenceService } from '../upload/blob-reference.service';
import { EditionStatus, Prisma } from '@prisma/client';

/**
 * ARK-137: el volcado de una edición grande (151 equipos en producción) es una transacción
 * interactiva con una escritura por equipo; el límite por defecto de Prisma (5 s) se queda corto.
 */
export const DUMP_TX_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

@Injectable()
export class HistoricalsService {
  private readonly logger = new Logger(HistoricalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blobRefs: BlobReferenceService,
  ) { }

  private async signTeams<T extends { videogame?: any }>(teams: T[]): Promise<T[]> {
    return this.blobRefs.resolveTeamsVideogames(teams);
  }

  async getAllHistoricalTeams() {
    const historicalTeams = await this.prisma.historicalTeam.findMany({
      include: {
        members: true, // Incluye los integrantes de cada equipo histórico
        videogame: true, // Incluye el videojuego asociado a cada equipo histórico
      },
    });
    if (historicalTeams.length === 0) {
      throw new NotFoundException('No historical teams found');
    }
    return this.signTeams(historicalTeams);
  }

  async getHistoricalTeamsByEdition(editionId: number) {
    // Verificar que la edición exista
    const edition = await this.prisma.edition.findUnique({ where: { id: editionId } });
    if (!edition) {
      throw new NotFoundException(`Edition with ID ${editionId} is not a valid edition ID`);
    }
    // Obtener los equipos históricos para la edición dada, incluyendo sus integrantes y videojuego
    const historicalTeams = await this.prisma.historicalTeam.findMany({
      where: { editionId },
      include: {
        members: true, // Incluye los integrantes de cada equipo histórico
        videogame: true, // Incluye el videojuego asociado a cada equipo histórico
      },
    });
    if (historicalTeams.length === 0) {
      throw new NotFoundException(`No historical teams found for edition with ID ${editionId}`);
    }
    return this.signTeams(historicalTeams);
  }

  async getHistoricalMembersByTeam(historicalTeamId: number) {
    // Verificar que el equipo histórico exista
    const historicalTeam = await this.prisma.historicalTeam.findUnique({ where: { id: historicalTeamId } });
    if (!historicalTeam) {
      throw new NotFoundException(`Historical team with ID ${historicalTeamId} not found`);
    }
    // Obtener los integrantes históricos para el equipo dado
    const historicalMembers = await this.prisma.historicalMember.findMany({
      where: { teamId: historicalTeamId },
    });
    if (historicalMembers.length === 0) {
      throw new NotFoundException(`No historical members found for team with ID ${historicalTeamId}`);
    }
    return historicalMembers;
  }

  async getHistoricalVideogamesByEdition(editionId: number) {
    // Verificar que la edición exista
    const edition = await this.prisma.edition.findUnique({ where: { id: editionId } });
    if (!edition) {
      throw new NotFoundException(`Edition with ID ${editionId} not found`);
    }
    const historicalTeams = await this.prisma.historicalTeam.findMany({
      where: { editionId },
      include: { videogame: true }, // Incluye el videojuego asociado a cada equipo histórico para verificar su existencia
    });
    if (historicalTeams.length === 0) {
      throw new NotFoundException(`No historical teams found for edition with ID ${editionId}, so no historical videogames can be retrieved`);
    }
    const historicalVideogames = historicalTeams
      .filter(team => team.videogame) // Filtra solo los equipos que tienen un videojuego asociado
      .map(team => team.videogame); // Mapea para obtener solo los videojuegos históricos
    if (historicalVideogames.length === 0) {
      throw new NotFoundException(`No historical videogames found for edition with ID ${editionId}`);
    }
    return Promise.all(historicalVideogames.map((v) => this.blobRefs.resolveVideogame(v)));
  }

  /**
   * HU-40 (ARK-226): archivo jugable de un juego histórico, con la misma forma que `GET /videogames/:id`
   * para que `/play-game` use el mismo cargador. Lo piden la página de ediciones pasadas y los
   * destacados de HU-41 (`play: { type: 'historical', id }`).
   * - La URL sale firmada por 1 h (`BlobReferenceService.resolve`); la BD guarda la referencia.
   * - Sin zip: `gameFileURL` y `entry` vacíos, igual que los juegos en vivo (el front muestra su error).
   * - Sin integrantes ni datos personales: es una ruta pública.
   */
  async getHistoricalGameFile(historicalVideogameId: number) {
    const game = await this.prisma.historicalVideogame.findUnique({
      where: { id: historicalVideogameId },
      select: {
        id: true,
        name: true,
        gameFileUrl: true,
        entry: true,
        allowMobile: true,
        historicalTeam: { select: { teamName: true, editionId: true } },
      },
    });
    if (!game) {
      throw new NotFoundException(`No existe el videojuego histórico ${historicalVideogameId}`);
    }
    return {
      id: game.id,
      name: game.name,
      teamName: game.historicalTeam.teamName,
      editionId: game.historicalTeam.editionId,
      gameFileURL: (await this.blobRefs.resolve(game.gameFileUrl)) || '',
      entry: game.entry || '',
      allowMobile: game.allowMobile, // TA-36 (ARK-326)
    };
  }

  /**
   * `POST /historicals/create-historical-edition-dump/:editionId`: volcado suelto, sin archivar.
   *
   * ARK-137 (TA-17): solo sirve para recuperar el volcado de una edición que ya está ARCHIVED y no
   * lo tiene. Sobre una edición ACTIVE o INACTIVE dejaba un volcado incompleto (los equipos que se
   * inscribían después no entraban) y, como ya «existía un volcado», `POST /editions/:id/archive`
   * quedaba bloqueado. Para cerrar una edición se usa siempre ese endpoint.
   */
  async createHistoricalEditionDump(editionId: number) {
    const edition = await this.prisma.edition.findUnique({ where: { id: editionId } });
    if (!edition) {
      throw new BadRequestException(`Edition with ID ${editionId} is not a valid edition ID`);
    }
    if (edition.status !== EditionStatus.ARCHIVED) {
      throw new BadRequestException(
        `La edición ${editionId} está ${edition.status}: para cerrarla usa POST /editions/${editionId}/archive, ` +
          'que vuelca el historial y la marca ARCHIVED en una sola operación. Este endpoint solo recupera ' +
          'el volcado de una edición ya archivada.',
      );
    }
    return this.prisma.$transaction((tx) => this.dumpEdition(tx, editionId), DUMP_TX_OPTIONS);
  }

  /**
   * Copia los equipos activos de la edición, sus integrantes (con sus NRC de esa edición) y su
   * videojuego (con likes y nota final) a las tablas históricas, dentro de la transacción `tx`.
   * No borra ni modifica nada de las tablas de trabajo (equipos, integrantes, videojuegos,
   * evaluaciones, asignaciones): siguen ahí como historial de solo lectura (HU-27).
   *
   * - 400 si la edición ya tiene volcado: nunca duplica el historial.
   * - Sin equipos: 404, salvo `allowEmpty` (archivar una edición vacía es válido).
   * - Si una escritura falla, sale el error y la transacción completa se deshace.
   */
  async dumpEdition(
    tx: Prisma.TransactionClient,
    editionId: number,
    { allowEmpty = false }: { allowEmpty?: boolean } = {},
  ): Promise<{ success: true; message: string; teamsDumpedCount: number }> {
    const existingDump = await tx.historicalTeam.findFirst({ where: { editionId } });
    if (existingDump) {
      throw new BadRequestException(
        `La edición ${editionId} ya tiene volcado histórico; no se vuelve a volcar para no duplicar el historial.`,
      );
    }
    // Solo equipos activos: los demás listados los tratan como inexistentes.
    const teamsToDump = await tx.team.findMany({
      where: { editionId, isActive: true },
      include: {
        members: { include: { nrcs: { where: { editionId } } } },
        videogame: {
          include: {
            _count: { select: { likedBy: true } },
          },
        },
      },
    });
    if (teamsToDump.length === 0) {
      if (allowEmpty) {
        return { success: true, message: 'La edición no tiene equipos: no había nada que volcar', teamsDumpedCount: 0 };
      }
      throw new NotFoundException(`No teams found for edition with ID ${editionId}`);
    }

    // Leer scores finales de la vista para guardarlos en el snapshot
    const scoreRows = await tx.teamFinalScore.findMany({
      where: { editionId },
    });
    const scoreByTeamId = new Map(scoreRows.map((r) => [r.teamId, r.finalScore ?? null]));

    for (const team of teamsToDump) {
      const finalScore = scoreByTeamId.get(team.id) ?? null;
      await tx.historicalTeam.create({
        data: {
          teamName: team.teamName,
          editionId: team.editionId,
          isExternal: team.isExternal,
          teamCode: team.teamCode,
          members: {
            create: team.members.map((member) => ({
              firstName: member.firstName,
              lastName: member.lastName,
              email: member.email,
              studentCode: member.studentCode,
              nrcs: {
                create: member.nrcs.map((nrc) => ({ nrcId: nrc.id, code: nrc.code })),
              },
            })),
          },
          ...(team.videogame && {
            videogame: {
              create: {
                name: team.videogame.name,
                description: team.videogame.description,
                logoUrl: team.videogame.logoUrl,
                repoUrl: team.videogame.repoUrl,
                videoUrl: team.videogame.videoUrl,
                additionalImages: team.videogame.additionalImages,
                gameFileUrl: team.videogame.gameFileUrl,
                entry: team.videogame.entry,
                allowMobile: team.videogame.allowMobile, // TA-36 (ARK-326)
                likes: team.videogame._count.likedBy,
                finalScore,
              },
            },
          }),
        },
      });
    }

    this.logger.log(`Volcado completado para la edición ${editionId}: ${teamsToDump.length} equipos.`);
    return {
      success: true,
      message: 'Volcado histórico realizado correctamente',
      teamsDumpedCount: teamsToDump.length,
    };
  }

  // Retorna equipos históricos de una edición, ordenados por finalScore DESC
  async getHistoricalTeamsWithScores(editionId: number) {
    const edition = await this.prisma.edition.findUnique({ where: { id: editionId } });
    if (!edition) throw new NotFoundException(`Edition with ID ${editionId} not found`);

    const historicalTeams = await this.prisma.historicalTeam.findMany({
      where: { editionId },
      include: { members: true, videogame: true },
    });
    if (historicalTeams.length === 0) {
      throw new NotFoundException(`No historical teams found for edition with ID ${editionId}`);
    }

    // Ordenar: primero los que tienen finalScore (desc), luego los que no
    return this.signTeams(historicalTeams.sort((a, b) => {
      const sa = a.videogame?.finalScore ?? null;
      const sb = b.videogame?.finalScore ?? null;
      if (sa === null && sb === null) return 0;
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sb - sa;
    }));
  }

  async updateHistoricalTeam(historicalTeamId: number, updateData: UpdateHistoricalTeamDto) {
    // Verificar que el equipo histórico exista
    const historicalTeam = await this.prisma.historicalTeam.findUnique({ where: { id: historicalTeamId } });
    if (!historicalTeam) {
      throw new NotFoundException(`Historical team with ID ${historicalTeamId} not found`);
    }
    // Actualizar el equipo histórico con los datos proporcionados
    try {
      const updatedTeam = await this.prisma.historicalTeam.update({
        where: { id: historicalTeamId },
        data: updateData,
      });
      return updatedTeam;
    } catch (error) {
      this.logger.error(`Error updating historical team with ID ${historicalTeamId}`, error);
      throw new InternalServerErrorException('An error occurred while updating the historical team.');
    }
  }

  async updateHistoricalMember(historicalMemberId: number, updateData: UpdateHistoricalMemberDto) {
    // Verificar que el miembro histórico exista
    const historicalMember = await this.prisma.historicalMember.findUnique({ where: { id: historicalMemberId } });
    if (!historicalMember) {
      throw new NotFoundException(`Historical member with ID ${historicalMemberId} not found`);
    }
    // Actualizar el miembro histórico con los datos proporcionados
    try {
      const updatedMember = await this.prisma.historicalMember.update({
        where: { id: historicalMemberId },
        data: updateData,
      });
      return updatedMember;
    } catch (error) {
      this.logger.error(`Error updating historical member with ID ${historicalMemberId}`, error);
      throw new InternalServerErrorException('An error occurred while updating the historical member.');
    }
  }

  async updateHistoricalVideogame(historicalVideogameId: number, updateData: UpdateHistoricalVideogameDto) {
    // Verificar que el videojuego histórico exista
    const historicalVideogame = await this.prisma.historicalVideogame.findUnique({ where: { id: historicalVideogameId } });
    if (!historicalVideogame) {
      throw new NotFoundException(`Historical videogame with ID ${historicalVideogameId} not found`);
    }
    // fuera del try: un archivo no válido es un 400, no un 500
    const data = await this.blobRefs.referenceVideogameFields(updateData, historicalVideogame);
    // Actualizar el videojuego histórico con los datos proporcionados
    try {
      const updatedVideogame = await this.prisma.historicalVideogame.update({
        where: { id: historicalVideogameId },
        data,
      });
      return await this.blobRefs.resolveVideogame(updatedVideogame);
    } catch (error) {
      this.logger.error(`Error updating historical videogame with ID ${historicalVideogameId}`, error);
      throw new InternalServerErrorException('An error occurred while updating the historical videogame.');
    }
  }

  async removeHistoricalTeam(historicalTeamId: number) {
    // Verificar que el equipo histórico exista
    const historicalTeam = await this.prisma.historicalTeam.findUnique({ where: { id: historicalTeamId } });
    if (!historicalTeam) {
      throw new NotFoundException(`Historical team with ID ${historicalTeamId} not found`);
    }
    // Eliminar el equipo histórico
    try {
      await this.prisma.historicalTeam.delete({ where: { id: historicalTeamId } });
      return { success: true, message: 'Historical team removed successfully' };
    } catch (error) {
      this.logger.error(`Error removing historical team with ID ${historicalTeamId}`, error);
      throw new InternalServerErrorException('An error occurred while removing the historical team.');
    }
  }

  async removeHistoricalMember(historicalMemberId: number) {
    // Verificar que el miembro histórico exista
    const historicalMember = await this.prisma.historicalMember.findUnique({ where: { id: historicalMemberId } });
    if (!historicalMember) {
      throw new NotFoundException(`Historical member with ID ${historicalMemberId} not found`);
    }
    // Eliminar el miembro histórico
    try {
      await this.prisma.historicalMember.delete({ where: { id: historicalMemberId } });
      return { success: true, message: 'Historical member removed successfully' };
    } catch (error) {
      this.logger.error(`Error removing historical member with ID ${historicalMemberId}`, error);
      throw new InternalServerErrorException('An error occurred while removing the historical member.');
    }
  }

  async removeHistoricalVideogame(historicalVideogameId: number) {
    // Verificar que el videojuego histórico exista
    const historicalVideogame = await this.prisma.historicalVideogame.findUnique({ where: { id: historicalVideogameId } });
    if (!historicalVideogame) {
      throw new NotFoundException(`Historical videogame with ID ${historicalVideogameId} not found`);
    }
    // Eliminar el videojuego histórico
    try {
      await this.prisma.historicalVideogame.delete({ where: { id: historicalVideogameId } });
      return { success: true, message: 'Historical videogame removed successfully' };
    } catch (error) {
      this.logger.error(`Error removing historical videogame with ID ${historicalVideogameId}`, error);
      throw new InternalServerErrorException('An error occurred while removing the historical videogame.');
    }
  }
}
