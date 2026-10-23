const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');

// Load capabilities module
const capSource = fs.readFileSync(path.join(root, 'src/services/capabilities.ts'), 'utf8');
const capContext = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(capSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  capContext
);
const {
  isCallerCapable,
  isCounselorCapable,
  isDualRole,
  isFaceVerificationExempt,
} = capContext.exports;

// Load counselor module
const counselorSource = fs.readFileSync(path.join(root, 'src/services/counselor.ts'), 'utf8');
const counselorContext = {
  exports: {},
  require: (mod) => {
    if (mod === './api') return { apiRequest: async () => ({}) };
    if (mod === './capabilities') return capContext.exports;
    throw new Error(`Unexpected import: ${mod}`);
  },
};
vm.runInNewContext(
  ts.transpileModule(counselorSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  counselorContext
);
const {
  homeRouteFor,
  canOfferForward,
  COUNSELOR_ROUTES,
} = counselorContext.exports;

// Load notification routing module
const notifSource = fs.readFileSync(path.join(root, 'src/services/notificationRouting.ts'), 'utf8');
const notifContext = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(notifSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  notifContext
);
const { websiteLeadNotificationTarget } = notifContext.exports;

// ---------------------------------------------------------------------------
// 1. Dual-Role capability resolution & modern vs legacy responses
// ---------------------------------------------------------------------------
test('modern capability payload correctly resolves dual-role employees', () => {
  const callerPrimaryDual = {
    role: 'CALLER',
    capabilities: { caller: true, counselor: true, dual_role: true, admin: false },
  };
  assert.equal(isCallerCapable(callerPrimaryDual), true);
  assert.equal(isCounselorCapable(callerPrimaryDual), true);
  assert.equal(isDualRole(callerPrimaryDual), true);

  const counselorPrimaryDual = {
    role: 'COUNSELOR',
    capabilities: { caller: true, counselor: true, dual_role: true, admin: false },
  };
  assert.equal(isCallerCapable(counselorPrimaryDual), true);
  assert.equal(isCounselorCapable(counselorPrimaryDual), true);
  assert.equal(isDualRole(counselorPrimaryDual), true);
});

test('legacy authentication responses containing only role are safely supported', () => {
  const legacyCaller = { role: 'CALLER' };
  assert.equal(isCallerCapable(legacyCaller), true);
  assert.equal(isCounselorCapable(legacyCaller), false);
  assert.equal(isDualRole(legacyCaller), false);

  const legacyCounselor = { role: 'COUNSELOR' };
  assert.equal(isCallerCapable(legacyCounselor), false);
  assert.equal(isCounselorCapable(legacyCounselor), true);
  assert.equal(isDualRole(legacyCounselor), false);

  const legacyEmployee = { role: 'EMPLOYEE' };
  assert.equal(isCallerCapable(legacyEmployee), false);
  assert.equal(isCounselorCapable(legacyEmployee), false);
  assert.equal(isDualRole(legacyEmployee), false);
});

test('missing, null or malformed capability fields fail safely without granting access', () => {
  // String instead of boolean
  const malformedString = { role: 'EMPLOYEE', capabilities: { caller: 'true', counselor: 'true' } };
  assert.equal(isCallerCapable(malformedString), false);
  assert.equal(isCounselorCapable(malformedString), false);
  assert.equal(isDualRole(malformedString), false);

  // Number instead of boolean
  const malformedNumber = { role: 'EMPLOYEE', capabilities: { caller: 1, counselor: 1 } };
  assert.equal(isCallerCapable(malformedNumber), false);
  assert.equal(isCounselorCapable(malformedNumber), false);
  assert.equal(isDualRole(malformedNumber), false);

  // Empty object
  const emptyCaps = { role: 'EMPLOYEE', capabilities: {} };
  assert.equal(isCallerCapable(emptyCaps), false);
  assert.equal(isCounselorCapable(emptyCaps), false);
  assert.equal(isDualRole(emptyCaps), false);

  // Null/undefined user
  assert.equal(isCallerCapable(null), false);
  assert.equal(isCounselorCapable(null), false);
  assert.equal(isDualRole(null), false);
  assert.equal(isCallerCapable(undefined), false);
  assert.equal(isCounselorCapable(undefined), false);
  assert.equal(isDualRole(undefined), false);
});

test('explicit capability revocation immediately revokes access', () => {
  const activeDual = {
    role: 'CALLER',
    capabilities: { caller: true, counselor: true, dual_role: true },
  };
  assert.equal(isDualRole(activeDual), true);
  assert.equal(isCounselorCapable(activeDual), true);

  // Admin revokes counselor capability
  const revokedCounselor = {
    ...activeDual,
    capabilities: { caller: true, counselor: false, dual_role: false },
  };
  assert.equal(isDualRole(revokedCounselor), false);
  assert.equal(isCounselorCapable(revokedCounselor), false);
  assert.equal(isCallerCapable(revokedCounselor), true);

  // Admin revokes caller capability from counselor-primary
  const counselorDual = {
    role: 'COUNSELOR',
    capabilities: { caller: true, counselor: true, dual_role: true },
  };
  const revokedCaller = {
    ...counselorDual,
    capabilities: { caller: false, counselor: true, dual_role: false },
  };
  assert.equal(isDualRole(revokedCaller), false);
  assert.equal(isCallerCapable(revokedCaller), false);
  assert.equal(isCounselorCapable(revokedCaller), true);
});

// ---------------------------------------------------------------------------
// 2. Entry flow & routing tests (homeRouteFor)
// ---------------------------------------------------------------------------
test('entry routing preserves existing single-role behavior and routes dual-role to employee dashboard', () => {
  // Pure caller lands on /employee
  assert.equal(homeRouteFor({ role: 'CALLER' }), '/employee');
  assert.equal(homeRouteFor({ role: 'CALLER', capabilities: { caller: true, counselor: false } }), '/employee');

  // Pure counselor lands on /counselor
  assert.equal(homeRouteFor({ role: 'COUNSELOR' }), '/counselor');
  assert.equal(homeRouteFor({ role: 'COUNSELOR', capabilities: { caller: false, counselor: true } }), '/counselor');

  // Counselor needing onboarding lands on /employee
  assert.equal(homeRouteFor({ role: 'COUNSELOR', needs_onboarding: true }), '/employee');

  // Dual-role employees land on /employee where the Workspace Switcher lives
  assert.equal(
    homeRouteFor({ role: 'CALLER', capabilities: { caller: true, counselor: true, dual_role: true } }),
    '/employee'
  );
  assert.equal(
    homeRouteFor({ role: 'COUNSELOR', capabilities: { caller: true, counselor: true, dual_role: true } }),
    '/employee'
  );

  // General employees land on /employee
  assert.equal(homeRouteFor({ role: 'IT' }), '/employee');
  assert.equal(homeRouteFor({ role: 'EMPLOYEE' }), '/employee');
});

// ---------------------------------------------------------------------------
// 3. Face verification exemption rules
// ---------------------------------------------------------------------------
test('face verification rules require dual-role employees to complete daily face check', () => {
  // Pure counselor without caller capability is exempt
  assert.equal(isFaceVerificationExempt({ role: 'COUNSELOR' }), true);
  assert.equal(isFaceVerificationExempt({ role: 'COUNSELOR', capabilities: { caller: false, counselor: true } }), true);

  // Caller is NOT exempt
  assert.equal(isFaceVerificationExempt({ role: 'CALLER' }), false);

  // Dual-role employee (even if primary role is COUNSELOR) is NOT exempt
  assert.equal(
    isFaceVerificationExempt({ role: 'COUNSELOR', capabilities: { caller: true, counselor: true } }),
    false
  );
  assert.equal(
    isFaceVerificationExempt({ role: 'CALLER', capabilities: { caller: true, counselor: true } }),
    false
  );

  // Admin without caller capability is exempt
  assert.equal(isFaceVerificationExempt({ role: 'ADMIN' }), true);
});

// ---------------------------------------------------------------------------
// 4. Can offer forward / self-forward capability
// ---------------------------------------------------------------------------
test('canOfferForward allows callers and dual-role employees with caller capability', () => {
  // Pure caller can forward interested leads
  assert.equal(canOfferForward({ role: 'CALLER' }, 'INTERESTED', 10), true);

  // Dual-role with counselor primary can forward interested leads
  assert.equal(
    canOfferForward(
      { role: 'COUNSELOR', capabilities: { caller: true, counselor: true } },
      'INTERESTED',
      10
    ),
    true
  );

  // Pure counselor cannot forward
  assert.equal(canOfferForward({ role: 'COUNSELOR' }, 'INTERESTED', 10), false);
});

// ---------------------------------------------------------------------------
// 5. Deep-link & notification routing for dual-role employees
// ---------------------------------------------------------------------------
test('notification routing allows dual-role employees to open both caller and counselor notifications', () => {
  const dualRoleUser = {
    role: 'CALLER',
    capabilities: { caller: true, counselor: true, dual_role: true },
    needs_onboarding: false,
  };
  const canCaller = isCallerCapable(dualRoleUser) && !dualRoleUser.needs_onboarding;
  const canCounselor = isCounselorCapable(dualRoleUser) && !dualRoleUser.needs_onboarding;

  // New website lead notification routes caller workspace
  const websiteLeadRoute = websiteLeadNotificationTarget(
    { type: 'NEW_WEBSITE_LEAD', lead_id: 101 },
    canCaller,
    true,
    canCounselor
  );
  assert.equal(websiteLeadRoute?.pathname, '/(tabs)/leads');
  assert.equal(websiteLeadRoute?.params.availableLeadId, '101');

  // Counselor forwarded notification routes counselor workspace
  const counselorForwardedRoute = websiteLeadNotificationTarget(
    { type: 'COUNSELOR_LEAD_FORWARDED', lead_id: 202 },
    canCaller,
    true,
    canCounselor
  );
  assert.equal(counselorForwardedRoute?.pathname, '/counselor-lead');
  assert.equal(counselorForwardedRoute?.params.id, '202');

  // Followup due notification routes to lead details
  const followupRoute = websiteLeadNotificationTarget(
    { type: 'FOLLOWUP_DUE', lead_id: 303 },
    canCaller,
    true,
    canCounselor
  );
  assert.equal(followupRoute?.pathname, '/lead-details');
  assert.equal(followupRoute?.params.id, '303');
});

// ---------------------------------------------------------------------------
// 6. Employee Dashboard workspace switcher UI verification
// ---------------------------------------------------------------------------
test('employee index contains dual-role workspace switcher guarded by isDualRole', () => {
  const employeeIndexSource = fs.readFileSync(path.join(root, 'src/app/employee/index.tsx'), 'utf8');
  assert.match(employeeIndexSource, /isDualRole\(user\)/);
  assert.match(employeeIndexSource, /dual-role-workspace-switcher/);
  assert.match(employeeIndexSource, /\/\(tabs\)/);
  assert.match(employeeIndexSource, /\/counselor/);
});

// ---------------------------------------------------------------------------
// 7. Stack.Protected and layout guards
// ---------------------------------------------------------------------------
test('layout file protects caller and counselor screens with capability helpers', () => {
  const layoutSource = fs.readFileSync(path.join(root, 'src/app/_layout.tsx'), 'utf8');
  assert.match(layoutSource, /isCallerCapable\(user\)/);
  assert.match(layoutSource, /isCounselorCapable\(user\)/);
  assert.match(layoutSource, /<Stack\.Protected guard={isCallerCapable\(user\) && !user\?\.needs_onboarding}>/);
  assert.match(layoutSource, /<Stack\.Protected guard={isCounselorCapable\(user\) && !user\?\.needs_onboarding}>/);
});

// ---------------------------------------------------------------------------
// 8. LeadContext capability integration
// ---------------------------------------------------------------------------
test('LeadContext loads data using isCallerCapable instead of hardcoded role check', () => {
  const leadContextSource = fs.readFileSync(path.join(root, 'src/context/LeadContext.tsx'), 'utf8');
  assert.match(leadContextSource, /isCallerCapable\(user\)/);
  assert.doesNotMatch(leadContextSource, /user\?\.role !== 'CALLER'/);
});

// ---------------------------------------------------------------------------
// 9. (tabs)/_layout.tsx caller tabs guard
// ---------------------------------------------------------------------------
test('(tabs)/_layout.tsx allows caller capable dual-role employees without role check', () => {
  const tabsLayoutSource = fs.readFileSync(path.join(root, 'src/app/(tabs)/_layout.tsx'), 'utf8');
  assert.match(tabsLayoutSource, /isCallerCapable/);
  assert.match(tabsLayoutSource, /!isCallerCapable\(user\)/);
  assert.doesNotMatch(tabsLayoutSource, /user\.role !== 'CALLER'/);
});

// ---------------------------------------------------------------------------
// 10. CallerPointsCard points UI capability integration
// ---------------------------------------------------------------------------
test('CallerPointsCard allows caller capable dual-role employees without scalar role check', () => {
  const cardSource = fs.readFileSync(path.join(root, 'src/components/CallerPointsCard.tsx'), 'utf8');
  assert.match(cardSource, /isCallerCapable/);
  assert.match(cardSource, /!isCallerCapable\(user\)/);
  assert.doesNotMatch(cardSource, /user\?\.role !== 'CALLER'/);
  assert.doesNotMatch(cardSource, /user\.role === 'CALLER'/);

  const dualCounselor = {
    role: 'COUNSELOR',
    capabilities: { caller: true, counselor: true, dual_role: true, admin: false },
  };
  const pureCounselor = {
    role: 'COUNSELOR',
    capabilities: { caller: false, counselor: true, dual_role: false, admin: false },
  };
  assert.equal(isCallerCapable(dualCounselor), true);
  assert.equal(isCallerCapable(pureCounselor), false);
});
