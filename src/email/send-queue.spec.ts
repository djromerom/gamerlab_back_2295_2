import { SendQueue } from './send-queue';

// BG-74 (ARK-289): los envíos pasan de a uno y con pausa. Reloj y esperas simulados.
function build(minIntervalMs = 2_000) {
  let clock = 0;
  const sleeps: number[] = [];
  const queue = new SendQueue({
    minIntervalMs,
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
  });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { queue, sleeps, advance, now: () => clock };
}

describe('SendQueue (BG-74)', () => {
  it('corre los envíos de a uno, en orden de llegada', async () => {
    const { queue } = build();
    const log: string[] = [];
    let release!: () => void;
    const first = queue.run(async () => {
      log.push('a:inicio');
      await new Promise<void>((resolve) => (release = resolve));
      log.push('a:fin');
    });
    const second = queue.run(() => {
      log.push('b');
      return Promise.resolve();
    });
    await new Promise(setImmediate);
    expect(log).toEqual(['a:inicio']);
    expect(queue.size).toBe(2);

    release();
    await Promise.all([first, second]);
    expect(log).toEqual(['a:inicio', 'a:fin', 'b']);
    expect(queue.size).toBe(0);
  });

  it('deja la pausa mínima entre un envío y el siguiente', async () => {
    const { queue, sleeps } = build(12_000);
    const starts: number[] = [];
    for (let i = 0; i < 3; i++) {
      void queue.run(() => {
        starts.push(i);
        return Promise.resolve();
      });
    }
    await queue.run(() => Promise.resolve());
    expect(starts).toEqual([0, 1, 2]);
    // El primero sale enseguida; cada uno de los otros tres espera la pausa completa.
    expect(sleeps).toEqual([12_000, 12_000, 12_000]);
  });

  it('no espera si ya pasó la pausa desde el último envío', async () => {
    const { queue, sleeps, advance } = build(2_000);
    await queue.run(() => Promise.resolve());
    advance(5_000);
    await queue.run(() => Promise.resolve());
    expect(sleeps).toEqual([]);
  });

  it('un envío que falla no frena a los siguientes y su error llega solo a quien lo encoló', async () => {
    const { queue } = build();
    const failed = queue.run(() => Promise.reject(new Error('ACS 429')));
    const next = queue.run(() => Promise.resolve('ok'));
    await expect(failed).rejects.toThrow('ACS 429');
    await expect(next).resolves.toBe('ok');
    expect(queue.size).toBe(0);
  });
});
