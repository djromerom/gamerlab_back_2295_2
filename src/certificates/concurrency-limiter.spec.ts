import { ConcurrencyLimiter } from './concurrency-limiter';

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('ConcurrencyLimiter (ARK-170)', () => {
  it('nunca corre más tareas que el máximo y las termina todas en orden', async () => {
    const limiter = new ConcurrencyLimiter(2);
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const release: (() => void)[] = [];

    const all = Array.from({ length: 5 }, (_, i) =>
      limiter.run(async () => {
        started.push(i);
        running++;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => release.push(resolve));
        running--;
        return i;
      }),
    );

    await tick();
    expect(started).toEqual([0, 1]);
    while (started.length < 5 || release.length > 0) {
      release.shift()?.();
      await tick();
    }

    await expect(Promise.all(all)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4]);
  });

  it('una tarea que falla libera su puesto', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const failing = limiter.run(() => Promise.reject(new Error('falló')));
    const next = limiter.run(() => Promise.resolve('siguiente'));

    await expect(failing).rejects.toThrow('falló');
    await expect(next).resolves.toBe('siguiente');
  });
});
