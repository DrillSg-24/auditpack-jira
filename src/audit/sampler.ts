export const SAMPLING_ALGORITHM = 'FNV1a-32 + Mulberry32 + Fisher-Yates' as const;

export interface AuditSampleMetadata {
  enabled: boolean;
  populationSize: number;
  sampleSize: number;
  requestedSampleSize: number;
  seed: string;
  algorithm: typeof SAMPLING_ALGORITHM;
}

export interface AuditSampleResult<T> {
  items: T[];
  metadata: AuditSampleMetadata;
}

/**
 * Hashes an arbitrary string seed into an unsigned 32-bit integer using FNV-1a.
 */
export function hashSeedToUint32(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 deterministic PRNG returning floats in [0, 1).
 */
export function mulberry32(initialSeed: number): () => number {
  let state = initialSeed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically selects up to `requestedSize` unique items from `population`
 * using a seeded Fisher-Yates shuffle. Does not mutate the input array.
 */
export function selectRandomSample<T>(
  population: readonly T[],
  requestedSize: number,
  rawSeed: string,
): AuditSampleResult<T> {
  const seed = rawSeed.trim() || 'PG-DEFAULT-SEED';
  const normalizedRequest = Number.isFinite(requestedSize)
    ? Math.max(1, Math.floor(requestedSize))
    : 25;

  const populationSize = population.length;
  if (populationSize === 0) {
    return {
      items: [],
      metadata: {
        enabled: true,
        populationSize: 0,
        sampleSize: 0,
        requestedSampleSize: normalizedRequest,
        seed,
        algorithm: SAMPLING_ALGORITHM,
      },
    };
  }

  const copy = [...population];
  const nextRandom = mulberry32(hashSeedToUint32(seed));

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }

  const sampleSize = Math.min(normalizedRequest, populationSize);
  const items = copy.slice(0, sampleSize);

  return {
    items,
    metadata: {
      enabled: true,
      populationSize,
      sampleSize,
      requestedSampleSize: normalizedRequest,
      seed,
      algorithm: SAMPLING_ALGORITHM,
    },
  };
}

/**
 * Generates a human-readable verifiable seed string (e.g. "PG-20261123-7A4F9C").
 */
export function generateVerifiableSeed(prefix = 'PG', now: Date = new Date()): string {
  const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'PG';
  const datePart = now.toISOString().slice(0, 10).replaceAll('-', '');

  const bytes = new Uint8Array(3);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hexSuffix = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');

  return `${cleanPrefix}-${datePart}-${hexSuffix}`;
}
