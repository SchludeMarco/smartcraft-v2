import { describe, expect, it } from 'vitest';
import { isAdminClaims } from './admin.js';

const google = { identities: { 'google.com': ['123'] } };
const marco = { admin: true, email: 'marco.schlude@gmail.com', email_verified: true, firebase: google };

describe('isAdminClaims', () => {
  it('accepts the admin account with claim and Google identity', () => {
    expect(isAdminClaims(marco)).toBe(true);
    expect(isAdminClaims({ ...marco, email: 'Marco.Schlude@Gmail.com' })).toBe(true);
  });

  it('rejects the admin claim on another account', () => {
    expect(isAdminClaims({ ...marco, email: 'fremd@gmail.com' })).toBe(false);
  });

  it('rejects the admin address without claim, verification or Google identity', () => {
    expect(isAdminClaims({ ...marco, admin: undefined })).toBe(false);
    expect(isAdminClaims({ ...marco, email_verified: false })).toBe(false);
    expect(isAdminClaims({ ...marco, firebase: { identities: { password: ['x'] } } })).toBe(false);
    expect(isAdminClaims(null)).toBe(false);
  });
});
