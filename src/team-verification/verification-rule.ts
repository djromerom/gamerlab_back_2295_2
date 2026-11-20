import { Prisma } from '@prisma/client';
import { isCollegeTeamCode } from './verification-code.util';

/**
 * HU-50 (ARK-314): regla única de «el jurado debe digitar el código de este equipo».
 *
 * Se exige solo si:
 * - el interruptor global «Exigir código de verificación a los jurados» de la edición del equipo
 *   está activo (sin configuración se exige, como antes),
 * - el Administrador no desactivó el código de ese equipo,
 * - y siguen las reglas de antes: el equipo tiene código y no es de colegios (N0).
 *
 * La usan la verificación, el estado para el front y las evaluaciones individual y por lote.
 */
export const VERIFICATION_RULE_SELECT = {
  teamCode: true,
  verificationCode: true,
  verificationRequired: true,
  edition: {
    select: {
      eventConfiguration: { select: { verificationCodesEnabled: true } },
    },
  },
} satisfies Prisma.TeamSelect;

/** Lo mínimo del equipo para aplicar la regla. Los campos de HU-50 faltantes cuentan como activos. */
export interface VerificationRuleTeam {
  teamCode: string;
  verificationCode: string | null;
  verificationRequired?: boolean;
  edition?: {
    eventConfiguration?: { verificationCodesEnabled: boolean } | null;
  } | null;
}

export function requiresVerificationCode(team: VerificationRuleTeam): boolean {
  const codesEnabled =
    team.edition?.eventConfiguration?.verificationCodesEnabled !== false;
  return (
    codesEnabled &&
    team.verificationRequired !== false &&
    !!team.verificationCode &&
    !isCollegeTeamCode(team.teamCode)
  );
}
