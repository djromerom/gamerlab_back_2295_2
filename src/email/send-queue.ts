/**
 * BG-74 (ARK-289): cola de envío de correos.
 *
 * El cupo de Azure ACS es uno solo para toda la suscripción (avisos a suplentes, verificación,
 * certificados…). Si cada petición envía por su cuenta, varias asignaciones seguidas llegan juntas
 * a ACS y desde el tercer correo responde 429. La cola hace pasar los envíos de a uno y deja una
 * pausa mínima entre el fin de un envío y el comienzo del siguiente. Un envío que espera un
 * `Retry-After` lo hace dentro de su turno, así que los demás esperan con él.
 *
 * Vive en memoria: hay un solo contenedor por entorno. Si el proceso se reinicia, lo que estaba
 * en cola se pierde (los avisos quedan en PENDING y se reenvían desde el panel).
 */
export interface SendQueueOptions {
  /** Pausa mínima entre el fin de un envío y el comienzo del siguiente. */
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SendQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private nextStartAt = 0;
  private waiting = 0;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: SendQueueOptions) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** Envíos en cola o en curso. */
  get size(): number {
    return this.waiting;
  }

  /** Corre `task` cuando le toque. Su resultado (o su error) llega solo a quien la encoló. */
  run<T>(task: () => Promise<T>): Promise<T> {
    this.waiting++;
    const result = this.tail.then(async () => {
      const wait = this.nextStartAt - this.now();
      if (wait > 0) await this.sleep(wait);
      try {
        return await task();
      } finally {
        this.nextStartAt = this.now() + this.options.minIntervalMs;
        this.waiting--;
      }
    });
    // Un envío fallido no frena a los siguientes.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
