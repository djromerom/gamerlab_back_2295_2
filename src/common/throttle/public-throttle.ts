import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

/*
 Request limits per IP for the public routes used by the web registration (BG-02).
 They are generous on purpose: many students register from the university network
 and share the same public IP. Behind a reverse proxy set TRUST_PROXY (see main.ts)
 so the limit applies to the real client IP and not to the proxy.

 IMPORTANT: the counters live IN MEMORY, inside each Node process (default
 @nestjs/throttler storage). That means:
 - Restarting or redeploying the container resets every counter to zero.
 - Each replica counts on its own. With N replicas behind a load balancer, a client
   can make up to N times the limit before getting 429.
 This is fine for today's single-container deployment. If the API is ever scaled to
 more than one replica, move the counters to a shared store (for example Redis, with
 a ThrottlerStorage implementation passed to ThrottlerModule.forRoot in app.module.ts).
 See "Rate limiting" in README.md.
*/
export const PUBLIC_LIMITS = {
  imageUpload: { limit: 60, ttl: 60_000 }, // 60 images per minute
  zipUpload: { limit: 10, ttl: 10 * 60_000 }, // 10 .zip per 10 minutes
  validateEmails: { limit: 15, ttl: 60_000 }, // 15 checks per minute
  login: { limit: 10, ttl: 60_000 }, // 10 login attempts per minute
  resetPassword: { limit: 5, ttl: 10 * 60_000 }, // 5 reset emails per 10 minutes
  resendConfirmation: { limit: 5, ttl: 10 * 60_000 }, // 5 confirmation emails per 10 minutes
} as const;

/** Applies the ThrottlerGuard with the given limit to a single route. */
export const PublicThrottle = (limit: { limit: number; ttl: number }) =>
  applyDecorators(UseGuards(ThrottlerGuard), Throttle({ default: limit }));
