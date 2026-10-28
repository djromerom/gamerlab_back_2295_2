import { ConfigService } from '@nestjs/config';

export const DEFAULT_ACCESS_TOKEN_EXPIRATION_MINUTES = 15;
export const DEFAULT_REFRESH_TOKEN_EXPIRATION_DAYS = 7;

export interface TokenExpiration {
  accessTokenSeconds: number;
  refreshTokenSeconds: number;
}

/**
 * Single source of truth for token lifetimes. Both the JWT `exp` and the cookie `maxAge`
 * must come from here, so they can never drift apart.
 *
 * Env values arrive as strings: an empty (`VAR=`) or invalid value falls back to the default
 * instead of becoming 0 (ConfigService only applies the default when the var is undefined).
 */
export function getTokenExpiration(
  configService: ConfigService,
): TokenExpiration {
  const accessMinutes = toPositiveNumber(
    configService.get<string>('ACCESS_TOKEN_EXPIRATION_MINUTES'),
    DEFAULT_ACCESS_TOKEN_EXPIRATION_MINUTES,
  );
  const refreshDays = toPositiveNumber(
    configService.get<string>('REFRESH_TOKEN_EXPIRATION_DAYS'),
    DEFAULT_REFRESH_TOKEN_EXPIRATION_DAYS,
  );

  return {
    accessTokenSeconds: Math.round(accessMinutes * 60),
    refreshTokenSeconds: Math.round(refreshDays * 24 * 60 * 60),
  };
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined &&
    value !== null &&
    value !== '' &&
    Number.isFinite(parsed) &&
    parsed > 0
    ? parsed
    : fallback;
}
