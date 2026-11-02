import { randomInt } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';

// Sin 0, O, 1, I para que el jurado no confunda caracteres al digitar.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_GENERATION_ATTEMPTS = 20;

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Los equipos de colegios (N0) no tienen código de verificación (P-25). */
export function isCollegeTeamCode(teamCode: string): boolean {
  return teamCode.startsWith('N0-');
}

export function randomVerificationCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Genera un código que no esté en uso en la edición (único por `[verificationCode, editionId]`). */
export async function generateUniqueVerificationCode(
  client: DbClient,
  editionId: number,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const code = randomVerificationCode();
    const inUse = await client.team.findFirst({
      where: { editionId, verificationCode: code },
      select: { id: true },
    });
    if (!inUse) return code;
  }
  throw new Error('No se pudo generar un código de verificación único');
}
