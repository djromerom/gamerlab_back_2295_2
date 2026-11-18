import { PrismaService } from '../prisma/prisma.service';

/**
 * HU-39 (ARK-209): equipos presentadores externos (equipos «no calificables») de una edición.
 * Conviven con los presentadores que son una persona (HU-33).
 */
export interface PresenterTeamView {
  id: number;
  teamCode: string;
  teamName: string;
  /** Título del proyecto: el nombre del videojuego, el que va en el certificado. */
  projectTitle: string | null;
  members: { firstName: string; lastName: string; email: string }[];
  /** ARK-258: último envío del certificado del equipo; null si no se ha enviado. */
  certificateSentAt: Date | null;
}

export async function presenterTeamsOf(
  prisma: Pick<PrismaService, 'team'>,
  editionId: number,
): Promise<PresenterTeamView[]> {
  const teams = await prisma.team.findMany({
    where: { editionId, isActive: true, notGradable: true },
    orderBy: [{ teamName: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      teamCode: true,
      teamName: true,
      presenterCertificateSentAt: true,
      videogame: { select: { name: true, isActive: true } },
      members: {
        where: { isActive: true },
        orderBy: { id: 'asc' },
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });
  return teams.map((team) => ({
    id: team.id,
    teamCode: team.teamCode,
    teamName: team.teamName,
    projectTitle: team.videogame?.isActive ? team.videogame.name : null,
    members: team.members,
    certificateSentAt: team.presenterCertificateSentAt,
  }));
}
