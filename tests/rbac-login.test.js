const assert = require('node:assert/strict');
const { validateRbacLogin } = require('../api/server.js');

const cases = [
  {
    name: 'accepts active user with allowed role',
    input: { profile: { id: 'user-1', email: 'admin@sss.gov.ph', username: 'admin', role: 'Admin', is_active: true }, allowedRoles: ['Admin', 'Super Admin'] },
    expected: { valid: true, role: 'Admin' },
  },
  {
    name: 'rejects inactive account',
    input: { profile: { id: 'user-2', email: 'officer@sss.gov.ph', username: 'ao1', role: 'Account Officer 1', is_active: false }, allowedRoles: ['Account Officer 1'] },
    expected: { valid: false, code: 'ACCOUNT_INACTIVE' },
  },
  {
    name: 'normalizes legacy officer role',
    input: { profile: { id: 'user-legacy', role: 'Assistant Officer 2', is_active: true }, allowedRoles: ['Account Officer 2'] },
    expected: { valid: true, role: 'Account Officer 2' },
  },
  {
    name: 'normalizes account assistant role',
    input: { profile: { id: 'user-assistant', role: 'Account Assistant 3', is_active: true }, allowedRoles: ['Account Officer 3'] },
    expected: { valid: true, role: 'Account Officer 3' },
  },
  {
    name: 'rejects unknown account',
    input: { profile: null, allowedRoles: ['Admin'] },
    expected: { valid: false, code: 'ACCOUNT_NOT_FOUND' },
  },
  {
    name: 'rejects role outside allowed scope',
    input: { profile: { id: 'user-3', email: 'user@sss.gov.ph', username: 'user', role: 'User', is_active: true }, allowedRoles: ['Admin'] },
    expected: { valid: false, code: 'ROLE_NOT_ALLOWED' },
  },
];

for (const testCase of cases) {
  const result = validateRbacLogin(testCase.input.profile, testCase.input.allowedRoles);
  assert.deepEqual(result, testCase.expected, `${testCase.name} mismatch`);
}

console.log(`Validated ${cases.length} RBAC login cases.`);
