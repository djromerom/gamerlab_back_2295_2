import { of } from 'rxjs';
import { RecaptchaService } from './recaptcha.service';

function make(env: Record<string, any>, score?: number) {
  const http: any = {
    post: jest.fn().mockReturnValue(of({ data: { success: true, score } })),
  };
  const config: any = { get: (k: string) => env[k] };
  return { svc: new RecaptchaService(http, config), http };
}

describe('RecaptchaService', () => {
  const full = {
    RECAPTCHA_SECRET_KEY: 's',
    RECAPTCHA_URL: 'https://example.test/verify',
    RECAPTCHA_SCORE: '0.7',
  };

  it('con las tres variables llama a la URL configurada con los parámetros', async () => {
    const { svc, http } = make(full, 0.9);
    await expect(svc.verify('tok')).resolves.toBe(true);
    expect(http.post).toHaveBeenCalledWith(
      'https://example.test/verify',
      null,
      {
        params: { secret: 's', response: 'tok' },
      },
    );
  });

  it('rechaza un score menor al umbral y acepta uno igual', async () => {
    await expect(make(full, 0.6).svc.verify('t')).resolves.toBe(false);
    await expect(make(full, 0.7).svc.verify('t')).resolves.toBe(true);
  });

  it('sin URL y sin score usa los valores por defecto', async () => {
    const { svc, http } = make({ RECAPTCHA_SECRET_KEY: 's' }, 0.4);
    await expect(svc.verify('t')).resolves.toBe(false);
    expect(http.post.mock.calls[0][0]).toBe(
      'https://www.google.com/recaptcha/api/siteverify',
    );
    await expect(
      make({ RECAPTCHA_SECRET_KEY: 's' }, 0.5).svc.verify('t'),
    ).resolves.toBe(true);
  });

  it('sin URL pero con score aplica el umbral configurado', async () => {
    const env = { RECAPTCHA_SECRET_KEY: 's', RECAPTCHA_SCORE: '0.8' };
    await expect(make(env, 0.6).svc.verify('t')).resolves.toBe(false);
  });

  it('sin secreto lanza error', () => {
    expect(() => make({})).toThrow();
  });
});
