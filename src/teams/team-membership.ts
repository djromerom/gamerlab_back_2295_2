import { Prisma } from '@prisma/client';
import { escapeLike } from '../common/utils/escape-like';
import { normalizeEmail } from '../common/utils/find-user-by-email';

/**
 * Los integrantes que no son líderes no tienen el equipo ligado a su cuenta (`Team.userId` es
 * solo el líder): se reconocen por su correo en `Member`, como en ARK-112 (`isTeamLeaderOrMember`).
 * Solo cuentan los integrantes activos.
 */
type MemberClient = Pick<Prisma.TransactionClient, 'member'>;

const activeMemberByEmail = (email: string): Prisma.MemberWhereInput => ({
  isActive: true,
  email: { equals: escapeLike(normalizeEmail(email)), mode: 'insensitive' },
});

/** Id del equipo en el que `email` es integrante activo en la edición dada, o null. */
export async function findMemberTeamId(
  client: MemberClient,
  email: string | null | undefined,
  editionId: number,
): Promise<number | null> {
  if (!email?.trim()) return null;
  const member = await client.member.findFirst({
    where: { ...activeMemberByEmail(email), editionId },
    select: { teamId: true },
  });
  return member?.teamId ?? null;
}

/** true si `email` es integrante activo del equipo `teamId`. */
export async function isActiveMemberOfTeam(
  client: MemberClient,
  email: string | null | undefined,
  teamId: number,
): Promise<boolean> {
  if (!email?.trim()) return false;
  const member = await client.member.findFirst({
    where: { ...activeMemberByEmail(email), teamId },
    select: { id: true },
  });
  return member !== null;
}
