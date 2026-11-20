import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from 'src/auth/auth.service';
import { JurorEditionImportMailQueue } from './juror-edition-import-mail.queue';

/** Cola con la pausa simulada: registra cada espera en vez de dormir. */
class TestQueue extends JurorEditionImportMailQueue {
  waits: number[] = [];
  protected override sleep(ms: number): Promise<void> {
    this.waits.push(ms);
    return Promise.resolve();
  }
}

describe('JurorEditionImportMailQueue (HU-49)', () => {
  const resend = jest.fn();
  const config = { get: jest.fn() };
  let queue: TestQueue;

  beforeEach(() => {
    jest.resetAllMocks();
    resend.mockResolvedValue({ message: 'ok' });
    config.get.mockReturnValue(undefined);
    queue = new TestQueue(
      { resendAuthEmailOfType: resend } as unknown as AuthService,
      config as unknown as ConfigService,
    );
  });

  it('manda los correos de verificación de uno en uno, con pausa entre ellos', async () => {
    queue.enqueue(['a@x.com', 'b@x.com', 'c@x.com']);
    await queue.idle();

    expect(resend.mock.calls).toEqual([
      ['a@x.com', 'VERIFICACION_EMAIL'],
      ['b@x.com', 'VERIFICACION_EMAIL'],
      ['c@x.com', 'VERIFICACION_EMAIL'],
    ]);
    // Dos pausas de 2,5 s: no hay pausa después del último.
    expect(queue.waits).toEqual([2_500, 2_500]);
    expect(queue.size).toBe(0);
  });

  it('la pausa sale de JUROR_IMPORT_EMAIL_DELAY_MS', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'JUROR_IMPORT_EMAIL_DELAY_MS' ? '4000' : undefined,
    );
    queue.enqueue(['a@x.com', 'b@x.com']);
    await queue.idle();
    expect(queue.waits).toEqual([4_000]);
  });

  it('un valor inválido de la variable usa la pausa por defecto', async () => {
    config.get.mockReturnValue('mucho');
    queue.enqueue(['a@x.com', 'b@x.com']);
    await queue.idle();
    expect(queue.waits).toEqual([2_500]);
  });

  it('no repite un correo que ya espera en la cola', async () => {
    expect(queue.enqueue(['a@x.com', 'b@x.com'])).toBe(2);
    expect(queue.enqueue(['a@x.com', 'c@x.com'])).toBe(1);
    await queue.idle();
    expect(resend).toHaveBeenCalledTimes(3);
  });

  it('un correo que falla se reintenta con espera larga y los demás siguen saliendo', async () => {
    resend
      .mockRejectedValueOnce(new InternalServerErrorException('falló'))
      .mockResolvedValue({ message: 'ok' });
    queue.enqueue(['a@x.com', 'b@x.com']);
    await queue.idle();

    expect(resend.mock.calls.map((call) => (call as string[])[0])).toEqual([
      'a@x.com',
      'a@x.com',
      'b@x.com',
    ]);
    expect(queue.waits).toEqual([30_000, 2_500]);
  });

  it('tras 3 intentos fallidos lo da por perdido y sigue con el siguiente', async () => {
    resend.mockImplementation((email: string) =>
      email === 'a@x.com'
        ? Promise.reject(new InternalServerErrorException('falló'))
        : Promise.resolve({ message: 'ok' }),
    );
    queue.enqueue(['a@x.com', 'b@x.com']);
    await queue.idle();

    const calls = resend.mock.calls.map((call) => (call as string[])[0]);
    expect(calls).toEqual(['a@x.com', 'a@x.com', 'a@x.com', 'b@x.com']);
    expect(queue.size).toBe(0);
  });

  it.each([
    ['la cuenta ya verificó su correo', new ConflictException('ya confirmado')],
    ['la cuenta no existe', new NotFoundException('no existe')],
  ])('si %s no reintenta', async (_label, error) => {
    resend.mockRejectedValueOnce(error).mockResolvedValue({ message: 'ok' });
    queue.enqueue(['a@x.com', 'b@x.com']);
    await queue.idle();
    expect(resend).toHaveBeenCalledTimes(2);
  });

  it('no escribe el correo completo en el log de errores', async () => {
    const logged: string[] = [];
    const logger = (
      queue as unknown as { logger: { error: (message: string) => void } }
    ).logger;
    jest.spyOn(logger, 'error').mockImplementation((message: string) => {
      logged.push(message);
    });
    resend.mockRejectedValue(new ConflictException('ya confirmado'));
    queue.enqueue(['ana.perez@empresa.com']);
    await queue.idle();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('a***@empresa.com');
    expect(logged[0]).not.toContain('ana.perez');
  });

  it('puede volver a usarse después de vaciarse', async () => {
    queue.enqueue(['a@x.com']);
    await queue.idle();
    queue.enqueue(['b@x.com']);
    await queue.idle();
    expect(resend).toHaveBeenCalledTimes(2);
  });
});
