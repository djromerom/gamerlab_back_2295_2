import { Injectable, NotFoundException, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { UpdateHistoricalTeamDto } from './dto/update-historical-team.dto';
import { UpdateHistoricalMemberDto } from './dto/update-historical-member.dto';
import { UpdateHistoricalVideogameDto } from './dto/update-historical-videogame.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HistoricalsService {
  private readonly logger = new Logger(HistoricalsService.name);
  
  constructor(
    private readonly prisma: PrismaService,
  ) { }

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
    return historicalTeams;
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
    return historicalTeams;
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
    return historicalVideogames;
  }

  // Create a dump from the current teams, members and videogames of a given edition
  async createHistoricalEditionDump(editionId: number) {
    // Verificar que la edición exista y no exista ya un dump para esa edición
    const edition = await this.prisma.edition.findUnique({ where: { id: editionId } });
    if (!edition) {
      throw new BadRequestException(`Edition with ID ${editionId} is not a valid edition ID`);
    }
    const existingDump = await this.prisma.historicalTeam.findFirst({ where: { editionId } });
    if (existingDump) {
      throw new BadRequestException(`A historical dump already exists for edition with ID ${editionId}`);
    }
    // Crear los dumps de equipos, miembros y videojuegos
    const teamsToDump = await this.prisma.team.findMany({
      where: { editionId },
      include: {
        members: true, // Trae los integrantes de cada equipo
        videogame: {
          include: {
            _count: {
              select: { likedBy: true }, // Obtenemos el conteo de likes (agregación en BD)
            },
          },
        },
      },
    });
    if (teamsToDump.length === 0) {
      throw new NotFoundException(`No teams found for edition with ID ${editionId}`);
    }

    // Definimos las operaciones de creación para cada equipo, sus integrantes y su videojuego
    const dumpOperations = teamsToDump.map((team) => {
      // Para cada equipo en teamsToDump, creamos un registro en historicalTeam y registros relacionados en historicalMember y historicalVideogame
      return this.prisma.historicalTeam.create({
        data: {
          teamName: team.teamName,
          editionId: team.editionId,
          isExternal: team.isExternal,
          teamCode: team.teamCode,
          // Creación anidada de integrantes históricos
          members: {
            create: team.members.map((member) => ({
              firstName: member.firstName,
              lastName: member.lastName,
              email: member.email,
              studentCode: member.studentCode,
            })),
          },
          // Creación anidada del videojuego histórico (si existe)
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
                likes: team.videogame._count.likedBy, // Asignamos el conteo exacto de likes
              },
            },
          }),
        },
      });
    });

    // Ejecutar todas las transacciones de manera atómica
    try {
      // Usar transacciones interactivas masivas garantiza que, si un equipo falla, 
      // ninguno se inserte y la base de datos se mantenga limpia.
      const result = await this.prisma.$transaction(dumpOperations);

      this.logger.log(`Volcado completado exitosamente para la edición ${editionId}.`);
      
      return {
        success: true,
        message: 'Volcado histórico realizado correctamente',
        teamsDumpedCount: result.length,
      };
    } catch (error) {
      this.logger.error('Error durante el volcado histórico', error);
      throw new InternalServerErrorException('Hubo un error crítico al realizar el volcado histórico.');
    }
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
    // Actualizar el videojuego histórico con los datos proporcionados
    try {
      const updatedVideogame = await this.prisma.historicalVideogame.update({
        where: { id: historicalVideogameId },
        data: updateData,
      });
      return updatedVideogame;
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
