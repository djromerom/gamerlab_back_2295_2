import { applyDecorators, Injectable, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';

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
  zipUpload: { limit: 3, ttl: 10 * 60_000 }, // 3 .zip per 10 minutes
  validateEmails: { limit: 15, ttl: 60_000 }, // 15 checks per minute
  validateStudentCodes: { limit: 15, ttl: 60_000 }, // 15 checks per minute (registration step 2)
  // Login is counted under TWO keys (see LoginThrottlerGuard): the main limit per IP + normalized
  // email, so nobody can guess passwords of one account, and users sharing a campus IP do not block
  // each other; plus a generous cap per IP alone against credential stuffing with many emails.
  login: { limit: 10, ttl: 60_000 }, // 10 attempts per minute per IP + email
  loginIp: { limit: 100, ttl: 60_000 }, // 100 attempts per minute per IP (any email)
  resetPassword: { limit: 5, ttl: 10 * 60_000 }, // 5 reset emails per 10 minutes
  resendConfirmation: { limit: 5, ttl: 10 * 60_000 }, // 5 confirmation emails per 10 minutes
} as const;

/** Applies the ThrottlerGuard with the given limit to a single route. */
export const PublicThrottle = (limit: { limit: number; ttl: number }) =>
  applyDecorators(UseGuards(ThrottlerGuard), Throttle({ default: limit }));

/**
 * Login guard with two counters: IP + normalized email (limit from @Throttle, 10/min) and IP alone
 * (PUBLIC_LIMITS.loginIp). The email comes from the body; if it is missing or not a string only
 * the IP counter applies.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const ipTracker = props.getTracker;
    await super.handleRequest({
      ...props,
      getTracker: async (req, context) => {
        const ip = await ipTracker(req, context);
        const body = (req as { body?: { email?: unknown } }).body;
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        return email ? `${ip}|${email}` : ip;
      },
    });
    return super.handleRequest({
      ...props,
      limit: PUBLIC_LIMITS.loginIp.limit,
      ttl: PUBLIC_LIMITS.loginIp.ttl,
      generateKey: (context, tracker, name) => props.generateKey(context, tracker, `${name}-ip`),
    });
  }
}

/** Login limits: 10/min per IP + email and 100/min per IP. */
export const LoginThrottle = () =>
  applyDecorators(UseGuards(LoginThrottlerGuard), Throttle({ default: PUBLIC_LIMITS.login }));
