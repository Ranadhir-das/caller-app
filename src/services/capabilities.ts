/** Centralized capability helpers for dual-role employees (Caller & Counselor).
 *
 * Supports modern backend responses containing `capabilities: { caller, counselor, dual_role, admin }`
 * as well as legacy authentication responses containing only `role`.
 */

export type UserCapabilities = {
  caller?: boolean;
  counselor?: boolean;
  dual_role?: boolean;
  admin?: boolean;
};

export type CapabilityUser = {
  role?: string | null;
  capabilities?: UserCapabilities | null;
  needs_onboarding?: boolean;
};

/** Determine if a user has approved Caller capability (workspace, dialer, leads, follow-ups).
 *  Fails safely if capabilities are malformed or missing without granting unintended access.
 */
export function isCallerCapable(user?: CapabilityUser | null): boolean {
  if (!user) return false;
  if (user.capabilities && typeof user.capabilities === 'object' && typeof user.capabilities.caller === 'boolean') {
    return user.capabilities.caller;
  }
  // Safe legacy fallback if capabilities object is absent
  return (user.role || '').toUpperCase() === 'CALLER';
}

/** Determine if a user has approved Counselor capability (workspace, counselling, notes).
 *  Fails safely if capabilities are malformed or missing without granting unintended access.
 */
export function isCounselorCapable(user?: CapabilityUser | null): boolean {
  if (!user) return false;
  if (user.capabilities && typeof user.capabilities === 'object' && typeof user.capabilities.counselor === 'boolean') {
    return user.capabilities.counselor;
  }
  // Safe legacy fallback if capabilities object is absent
  return (user.role || '').toUpperCase() === 'COUNSELOR';
}

/** Determine if an employee possesses both Caller and Counselor capabilities.
 *  A user is dual-role if and only if both Caller and Counselor capabilities are active.
 */
export function isDualRole(user?: CapabilityUser | null): boolean {
  if (!user) return false;
  if (user.capabilities && typeof user.capabilities === 'object' && typeof user.capabilities.dual_role === 'boolean') {
    return user.capabilities.dual_role && isCallerCapable(user) && isCounselorCapable(user);
  }
  return isCallerCapable(user) && isCounselorCapable(user);
}

/** Determine if an employee is exempt from daily face verification.
 *  Dual-role employees and Callers MUST always complete face verification.
 */
export function isFaceVerificationExempt(user?: CapabilityUser | null): boolean {
  if (!user) return false;
  if (isCallerCapable(user)) return false;
  const role = (user.role || '').toUpperCase();
  return role === 'COUNSELOR' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}
