export interface ForgeLicensePayload {
  active?: boolean;
  isActive?: boolean;
  isEvaluation?: boolean;
  billingPeriod?: string;
  capabilitySet?: string;
}

export interface ForgeResolverContextLike {
  environmentType?: string;
  license?: ForgeLicensePayload | null;
}

export type LicenseAccessReason =
  | 'ACTIVE_LICENSE'
  | 'NON_PRODUCTION_BYPASS'
  | 'LICENSE_INACTIVE';

export interface LicenseStatus {
  allowed: boolean;
  active: boolean;
  environmentType: string;
  isEvaluation: boolean;
  reason: LicenseAccessReason;
}

/**
 * Evaluates Forge Marketplace license state from resolver context.
 * Enforces an active license strictly in PRODUCTION while remaining testable
 * in DEVELOPMENT and STAGING environments.
 */
export function evaluateLicenseAccess(
  context: ForgeResolverContextLike | null | undefined,
): LicenseStatus {
  const environmentType = (context?.environmentType ?? 'DEVELOPMENT').trim().toUpperCase();
  const license = context?.license ?? null;
  const active = Boolean(license?.active ?? license?.isActive);
  const isEvaluation = Boolean(license?.isEvaluation);

  if (active) {
    return {
      allowed: true,
      active: true,
      environmentType,
      isEvaluation,
      reason: 'ACTIVE_LICENSE',
    };
  }

  if (environmentType !== 'PRODUCTION') {
    return {
      allowed: true,
      active: false,
      environmentType,
      isEvaluation,
      reason: 'NON_PRODUCTION_BYPASS',
    };
  }

  return {
    allowed: false,
    active: false,
    environmentType,
    isEvaluation,
    reason: 'LICENSE_INACTIVE',
  };
}

/**
 * Guard invoked at the start of operational Forge backend resolvers.
 */
export function assertLicensed(
  context: ForgeResolverContextLike | null | undefined,
): LicenseStatus {
  const status = evaluateLicenseAccess(context);
  if (!status.allowed) {
    throw new Error(
      'LICENSE_REQUIRED: ProofGate requires an active Atlassian Marketplace license in production. Ask a Jira site admin to activate or renew ProofGate under Manage Apps.',
    );
  }
  return status;
}
