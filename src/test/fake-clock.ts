/** Deterministic clock whose `sleep` advances time instantly and records each delay. */
export interface FakeClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  advance: (ms: number) => void;
  sleeps: number[];
}

/**
 * Create a {@link FakeClock} starting at `start` ms.
 *
 * @param start - Initial epoch ms.
 */
export function fakeClock(start = 0): FakeClock {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms) => {
      t += ms;
    },
    sleeps,
  };
}
