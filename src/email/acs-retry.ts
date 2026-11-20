import { RestError } from '@azure/core-rest-pipeline';

/**
 * BG-74 (ARK-289): qué fallos de ACS se reintentan y cuánto esperar.
 *
 * Solo se reintenta mientras ACS no haya aceptado el correo: 429, 5xx, timeout o un error de red
 * antes de la respuesta. El 429 trae `Retry-After`; se respeta en lugar del backoff fijo.
 */

/** Errores de red de Node que el SDK también reintentaba. */
const NETWORK_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'REQUEST_SEND_ERROR',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

function statusCodeOf(error: unknown): number | undefined {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === 'number' ? code : undefined;
}

export function isTransientAcsError(error: unknown): boolean {
  const statusCode = statusCodeOf(error);
  if (statusCode === 429 || (statusCode !== undefined && statusCode >= 500))
    return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return (
    error instanceof RestError && NETWORK_ERROR_CODES.has(error.code ?? '')
  );
}

export function isRateLimitError(error: unknown): boolean {
  return statusCodeOf(error) === 429;
}

/**
 * Milisegundos que ACS pide esperar (`retry-after-ms`, `x-ms-retry-after-ms` o `Retry-After` en
 * segundos o como fecha HTTP). `null` si no lo dice.
 */
export function retryAfterMs(
  error: unknown,
  now: number = Date.now(),
): number | null {
  const headers = (
    error as {
      response?: { headers?: { get?: (name: string) => unknown } };
    } | null
  )?.response?.headers;
  if (typeof headers?.get !== 'function') return null;
  const read = (name: string): string | undefined => {
    const value = headers.get?.(name);
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : undefined;
  };

  for (const name of ['retry-after-ms', 'x-ms-retry-after-ms']) {
    const ms = Number(read(name));
    if (read(name) !== undefined && Number.isFinite(ms) && ms >= 0) return ms;
  }

  const retryAfter = read('retry-after');
  if (retryAfter === undefined) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(retryAfter);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * Espera antes del siguiente intento, o `null` si no se reintenta: el error no es transitorio, se
 * acabaron los intentos o ACS pide esperar más de `maxWaitMs` (se falla ya y se reenvía después).
 */
export function acsRetryDelayMs(
  error: unknown,
  attempt: number,
  {
    maxAttempts,
    baseDelayMs,
    maxWaitMs,
  }: { maxAttempts: number; baseDelayMs: number; maxWaitMs: number },
): number | null {
  if (!isTransientAcsError(error) || attempt >= maxAttempts) return null;
  const backoff = baseDelayMs * 2 ** (attempt - 1);
  const requested = retryAfterMs(error);
  if (requested === null) return backoff;
  if (requested > maxWaitMs) return null;
  return Math.max(requested, backoff);
}

/** Dominio `…azurecomm.net`: administrado por Azure, con cupo de 5 por minuto y 10 por hora. */
export function isAzureManagedSender(senderAddress: string): boolean {
  return /@[^@]*\.azurecomm\.net$/i.test(senderAddress.trim());
}
