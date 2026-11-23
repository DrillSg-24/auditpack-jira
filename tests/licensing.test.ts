import { describe, expect, it } from 'vitest';
import { assertLicensed, evaluateLicenseAccess } from '../src/audit/licensing';

describe('ProofGate Marketplace license guard', () => {
  it('allows active licenses in production (including trials/evaluations)', () => {
    const prodActive = evaluateLicenseAccess({
      environmentType: 'PRODUCTION',
      license: { active: true, isEvaluation: true },
    });
    expect(prodActive.allowed).toBe(true);
    expect(prodActive.active).toBe(true);
    expect(prodActive.isEvaluation).toBe(true);
    expect(prodActive.reason).toBe('ACTIVE_LICENSE');
    expect(() => assertLicensed({ environmentType: 'PRODUCTION', license: { active: true } })).not.toThrow();
  });

  it('blocks inactive or missing licenses strictly in PRODUCTION', () => {
    const prodInactive = evaluateLicenseAccess({
      environmentType: 'PRODUCTION',
      license: { active: false },
    });
    expect(prodInactive.allowed).toBe(false);
    expect(prodInactive.reason).toBe('LICENSE_INACTIVE');

    const prodMissing = evaluateLicenseAccess({
      environmentType: 'PRODUCTION',
      license: null,
    });
    expect(prodMissing.allowed).toBe(false);
    expect(() => assertLicensed({ environmentType: 'PRODUCTION', license: null })).toThrow(
      /LICENSE_REQUIRED/,
    );
  });

  it('permits testing in DEVELOPMENT and STAGING even without an active Marketplace license', () => {
    const dev = evaluateLicenseAccess({ environmentType: 'DEVELOPMENT', license: null });
    const staging = evaluateLicenseAccess({ environmentType: 'STAGING', license: { active: false } });

    expect(dev.allowed).toBe(true);
    expect(dev.reason).toBe('NON_PRODUCTION_BYPASS');
    expect(staging.allowed).toBe(true);
    expect(staging.reason).toBe('NON_PRODUCTION_BYPASS');
    expect(() => assertLicensed({ environmentType: 'DEVELOPMENT' })).not.toThrow();
  });
});
