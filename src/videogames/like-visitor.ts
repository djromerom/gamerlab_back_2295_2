import { UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CookieOptions, Request, Response } from 'express';

/*
 Likes sin iniciar sesión. Un visitante sin cuenta se identifica con una cookie anónima
 (un UUID aleatorio, httpOnly) que el back crea en su primer like. Con ella el visitante
 no puede repetir el like en el mismo navegador y puede quitarlo. No impide volver a
 dar like desde incógnito o borrando cookies: eso lo frena el límite por IP de
 LikeThrottlerGuard (public-throttle.ts).
*/
export const VISITOR_COOKIE = 'arkad_visitor';
const VISITOR_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 año

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Header que manda el front cuando cree tener sesión. Si llega sin una sesión válida (el token de
 * acceso venció y el navegador ya borró su cookie), el back responde 401 para que el front renueve
 * la sesión y repita, en vez de guardar el like como de un visitante anónimo.
 */
export const SESSION_HEADER = 'x-arkad-session';
const ACCESS_TOKEN_COOKIE = 'access-token'; // mismo nombre que jwt.strategy.ts

/** 401 si el cliente dice tener sesión (header o cookie de acceso) pero no hay usuario válido. */
export function assertSessionIfClaimed(req: Request, user: unknown): void {
  if (user) return;
  const cookies = req.cookies as Record<string, unknown> | undefined;
  if (req.headers[SESSION_HEADER] || cookies?.[ACCESS_TOKEN_COOKIE]) {
    throw new UnauthorizedException('La sesión expiró');
  }
}

/** Quién da el like: un usuario con sesión o un visitante anónimo. */
export type Liker = { userId: string } | { visitorId: string };

/** Id de visitante de la cookie, solo si es un UUID válido (otro valor se ignora). */
export function readVisitorId(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[
    VISITOR_COOKIE
  ];
  return typeof value === 'string' && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : undefined;
}

function visitorCookieOptions(): CookieOptions {
  // Igual que las cookies de sesión (auth.service.ts setAuthCookies)
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    maxAge: VISITOR_COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

/** Id de visitante de la cookie; si no hay, crea uno nuevo y deja la cookie en la respuesta. */
export function ensureVisitorId(req: Request, res: Response): string {
  const existing = readVisitorId(req);
  if (existing) return existing;
  const visitorId = randomUUID();
  res.cookie(VISITOR_COOKIE, visitorId, visitorCookieOptions());
  return visitorId;
}

/** Condición única de Prisma para buscar o borrar el like de este autor en un juego. */
export function likeWhere(videogameId: number, liker: Liker) {
  return 'userId' in liker
    ? { videogameId_userId: { videogameId, userId: liker.userId } }
    : { videogameId_visitorId: { videogameId, visitorId: liker.visitorId } };
}
