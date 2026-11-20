import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from 'src/auth/auth.service';

const DEFAULT_DELAY_MS = 2_500; // ~24 correos por minuto, bajo el cupo de ACS (BG-74)
const DEFAULT_RETRY_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 3;

/**
 * HU-49 (ARK-280): cola en memoria de los correos de verificación de la importación de jurados.
 *
 * Azure ACS limita los envíos por minuto (BG-74: solo salían los dos primeros). La importación
 * guarda las cuentas y responde enseguida; esta cola manda los correos de uno en uno, con una
 * pausa entre ellos (`JUROR_IMPORT_EMAIL_DELAY_MS`, 2,5 s por defecto), y reintenta con espera
 * larga si ACS rechaza el envío.
 *
 * Límites conocidos: si el servidor se reinicia, lo que quedaba en la cola se pierde (el correo
 * se reenvía desde Personal → Jurados), y no distingue un 429 de otro fallo porque
 * `resendAuthEmailOfType` lo convierte en un 500 genérico. Si DevOps (ARK-289) deja una cola
 * común de correos, esta clase se reemplaza por ella.
 */
@Injectable()
export class JurorEditionImportMailQueue {
  private readonly logger = new Logger(JurorEditionImportMailQueue.name);
  private readonly pending: string[] = [];
  private draining: Promise<void> | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Agrega correos a la cola sin repetir los que ya esperan. Devuelve cuántos agregó. */
  enqueue(emails: string[]): number {
    let added = 0;
    for (const email of emails) {
      if (this.pending.includes(email)) continue;
      this.pending.push(email);
      added++;
    }
    if (added > 0 && !this.draining) {
      this.draining = this.drain().finally(() => {
        this.draining = null;
      });
    }
    return added;
  }

  /** Cuántos correos esperan salir (para pruebas y diagnóstico). */
  get size(): number {
    return this.pending.length;
  }

  /** Promesa que se cumple cuando la cola queda vacía (solo para pruebas). */
  idle(): Promise<void> {
    return this.draining ?? Promise.resolve();
  }

  private number(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async drain(): Promise<void> {
    const delay = this.number('JUROR_IMPORT_EMAIL_DELAY_MS', DEFAULT_DELAY_MS);
    while (this.pending.length > 0) {
      const email = this.pending[0];
      await this.sendWithRetries(email);
      this.pending.shift();
      if (this.pending.length > 0) await this.sleep(delay);
    }
  }

  private async sendWithRetries(email: string): Promise<void> {
    const retryDelay = this.number(
      'JUROR_IMPORT_EMAIL_RETRY_DELAY_MS',
      DEFAULT_RETRY_DELAY_MS,
    );
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.auth.resendAuthEmailOfType(email, 'VERIFICACION_EMAIL');
        return;
      } catch (error) {
        const final =
          error instanceof NotFoundException ||
          error instanceof BadRequestException ||
          error instanceof ConflictException; // ya verificó su cuenta: no hace falta el correo
        const reason = error instanceof Error ? error.message : String(error);
        if (final || attempt === MAX_ATTEMPTS) {
          this.logger.error(
            `No salió el correo de verificación a ${this.mask(email)} (intento ${attempt}): ${reason}. Se puede reenviar desde Personal → Jurados.`,
          );
          return;
        }
        this.logger.warn(
          `Falló el correo a ${this.mask(email)} (intento ${attempt}/${MAX_ATTEMPTS}): ${reason}. Reintenta en ${retryDelay} ms.`,
        );
        await this.sleep(retryDelay * attempt);
      }
    }
  }

  /** `ana.perez@uninorte.edu.co` → `a***@uninorte.edu.co` para no llenar el log de correos. */
  private mask(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 1)}***@${domain ?? ''}`;
  }
}
