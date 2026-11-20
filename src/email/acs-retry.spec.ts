import { RestError } from '@azure/core-rest-pipeline';
import {
  acsRetryDelayMs,
  isAzureManagedSender,
  isTransientAcsError,
  retryAfterMs,
} from './acs-retry';

// BG-74 (ARK-289): qué se reintenta y cuánto se espera.
const withHeaders = (statusCode: number, headers: Record<string, string>) =>
  new RestError(`HTTP ${statusCode}`, {
    statusCode,
    response: { headers: { get: (name: string) => headers[name] } } as never,
  });
const retry = { maxAttempts: 3, baseDelayMs: 1_000, maxWaitMs: 60_000 };

describe('acs-retry (BG-74)', () => {
  it('reintenta 429, 5xx, timeout y errores de red; no un 400', () => {
    expect(isTransientAcsError(withHeaders(429, {}))).toBe(true);
    expect(isTransientAcsError(withHeaders(503, {}))).toBe(true);
    expect(
      isTransientAcsError(
        Object.assign(new Error('x'), { name: 'AbortError' }),
      ),
    ).toBe(true);
    expect(
      isTransientAcsError(new RestError('red', { code: 'REQUEST_SEND_ERROR' })),
    ).toBe(true);
    expect(isTransientAcsError(withHeaders(400, {}))).toBe(false);
    expect(isTransientAcsError(new Error('otro'))).toBe(false);
  });

  it('lee Retry-After en segundos, como fecha y en milisegundos', () => {
    const now = Date.parse('2026-11-26T15:00:00Z');
    expect(retryAfterMs(withHeaders(429, { 'retry-after': '30' }))).toBe(
      30_000,
    );
    expect(
      retryAfterMs(
        withHeaders(429, { 'retry-after': 'Thu, 26 Nov 2026 15:00:20 GMT' }),
        now,
      ),
    ).toBe(20_000);
    expect(retryAfterMs(withHeaders(429, { 'retry-after-ms': '1500' }))).toBe(
      1_500,
    );
    expect(retryAfterMs(withHeaders(429, {}))).toBeNull();
    expect(retryAfterMs(new Error('sin respuesta'))).toBeNull();
  });

  it('espera lo que pide ACS (nunca menos que el backoff) y se rinde si pide más del máximo', () => {
    expect(acsRetryDelayMs(withHeaders(503, {}), 1, retry)).toBe(1_000);
    expect(acsRetryDelayMs(withHeaders(503, {}), 2, retry)).toBe(2_000);
    expect(
      acsRetryDelayMs(withHeaders(429, { 'retry-after': '7' }), 1, retry),
    ).toBe(7_000);
    expect(
      acsRetryDelayMs(withHeaders(429, { 'retry-after': '0' }), 2, retry),
    ).toBe(2_000);
    expect(
      acsRetryDelayMs(withHeaders(429, { 'retry-after': '3600' }), 1, retry),
    ).toBeNull();
    expect(acsRetryDelayMs(withHeaders(503, {}), 3, retry)).toBeNull();
    expect(acsRetryDelayMs(withHeaders(400, {}), 1, retry)).toBeNull();
  });

  it('reconoce el dominio administrado por Azure', () => {
    expect(isAzureManagedSender('DoNotReply@1a2b3c.azurecomm.net')).toBe(true);
    expect(isAzureManagedSender('no-reply@arkad.uninorte.edu.co')).toBe(false);
  });
});
