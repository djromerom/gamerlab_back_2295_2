import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

/*
 Request limits per IP for the public routes used by the web registration (BG-02).
 They are generous on purpose: many students register from the university network
 and share the same public IP. Behind a reverse proxy set TRUST_PROXY (see main.ts)
 so the limit applies to the real client IP and not to the proxy.
*/
export const PUBLIC_LIMITS = {
  imageUpload: { limit: 60, ttl: 60_000 }, // 60 images per minute
  zipUpload: { limit: 10, ttl: 10 * 60_000 }, // 10 .zip per 10 minutes
  validateEmails: { limit: 30, ttl: 60_000 }, // 30 checks per minute
} as const;

/** Applies the ThrottlerGuard with the given limit to a single route. */
export const PublicThrottle = (limit: { limit: number; ttl: number }) =>
  applyDecorators(UseGuards(ThrottlerGuard), Throttle({ default: limit }));
