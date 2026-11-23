import { describe, expect, it } from 'vitest';
import {
  generateVerifiableSeed,
  SAMPLING_ALGORITHM,
  selectRandomSample,
} from '../src/audit/sampler';

describe('ProofGate deterministic auditor random sampler', () => {
  const population = Array.from({ length: 100 }, (_, i) => `PAY-${i + 1}`);

  it('produces identical ordered samples for the same population and seed', () => {
    const run1 = selectRandomSample(population, 25, 'PG-20261123-A1B2C3');
    const run2 = selectRandomSample(population, 25, 'PG-20261123-A1B2C3');

    expect(run1.items).toHaveLength(25);
    expect(run1.items).toEqual(run2.items);
    expect(new Set(run1.items).size).toBe(25);
    expect(run1.metadata).toEqual({
      enabled: true,
      populationSize: 100,
      sampleSize: 25,
      requestedSampleSize: 25,
      seed: 'PG-20261123-A1B2C3',
      algorithm: SAMPLING_ALGORITHM,
    });
  });

  it('produces distinct samples when the seed changes and does not mutate population', () => {
    const snapshotBefore = [...population];
    const sampleA = selectRandomSample(population, 25, 'SEED-ALPHA');
    const sampleB = selectRandomSample(population, 25, 'SEED-BETA');

    expect(population).toEqual(snapshotBefore);
    expect(sampleA.items).not.toEqual(sampleB.items);
  });

  it('caps sample size safely when population is smaller than N', () => {
    const smallPop = ['PG-1', 'PG-2', 'PG-3', 'PG-4', 'PG-5'];
    const result = selectRandomSample(smallPop, 25, 'SMALL-SEED');

    expect(result.items).toHaveLength(5);
    expect(new Set(result.items)).toEqual(new Set(smallPop));
    expect(result.metadata.populationSize).toBe(5);
    expect(result.metadata.sampleSize).toBe(5);
    expect(result.metadata.requestedSampleSize).toBe(25);
  });

  it('handles empty populations gracefully', () => {
    const result = selectRandomSample([], 25, 'EMPTY-SEED');
    expect(result.items).toEqual([]);
    expect(result.metadata.populationSize).toBe(0);
    expect(result.metadata.sampleSize).toBe(0);
  });

  it('generates verifiable human-readable seed strings', () => {
    const seed = generateVerifiableSeed('PG', new Date('2026-11-23T12:00:00.000Z'));
    expect(seed).toMatch(/^PG-20261123-[0-9A-F]{6}$/);
  });
});
