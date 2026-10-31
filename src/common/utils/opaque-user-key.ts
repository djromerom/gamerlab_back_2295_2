import { Logger } from '@nestjs/common';
import { createHmac } from 'crypto';

let warnedDevSecret = false;

/*
 Clave opaca por usuario para datos públicos (sockets, /teams): hex(HMAC-SHA256(userId, secreto)).slice(0, 16).
 Estable por usuario, no reversible y sin exponer el UUID. El secreto es SOCKET_KEY_SECRET.
*/
export function getSocketKeySecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SOCKET_KEY_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === 'production') {
    throw new Error('SOCKET_KEY_SECRET is not defined. Set it in production to derive opaque user keys.');
  }
  if (!warnedDevSecret) {
    warnedDevSecret = true;
    new Logger('OpaqueUserKey').warn('SOCKET_KEY_SECRET is not set: using the fixed development secret.');
  }
  return 'dev-only-socket-key-secret';
}

export function opaqueUserKey(userId: string, secret: string = getSocketKeySecret()): string {
  return createHmac('sha256', secret).update(userId).digest('hex').slice(0, 16);
}
