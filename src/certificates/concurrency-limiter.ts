/**
 * ARK-170 (TA-19): deja correr como máximo `max` tareas a la vez; las demás esperan su turno en
 * orden de llegada. Una tarea que falla libera su puesto igual.
 */
export class ConcurrencyLimiter {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) {
      // El puesto pasa directo de quien termina a quien espera (ver `finally`).
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running++;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
}
