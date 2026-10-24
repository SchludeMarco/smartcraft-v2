import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake für das Admin-SDK: nur collection/doc/get, Gast-Dokumente liegen in
// einem Set aus Doc-Pfaden.
vi.mock('firebase-admin/firestore', () => {
  const docs = new Set();
  const reads = { count: 0 };
  const ref = (path) => ({
    collection: (name) => ({ doc: (id) => ref(`${path}${name}/${id}/`) }),
    get: async () => {
      reads.count += 1;
      return { exists: docs.has(path) };
    },
  });
  return {
    getFirestore: () => ref(''),
    __fakeGuests: { docs, reads },
  };
});

const { isInvited } = await import('./_lib/guests.js');
const { __fakeGuests } = await import('firebase-admin/firestore');
const { APP_ID } = await import('../shared/appId.js');

const FAKE_APP = {};
const invite = (email) => __fakeGuests.docs.add(`artifacts/${APP_ID}/guests/${email}/`);

beforeEach(() => {
  __fakeGuests.docs.clear();
  __fakeGuests.reads.count = 0;
});

describe('isInvited', () => {
  it('lets the admin account in without a guest entry', async () => {
    const admin = { admin: true, email: 'Marco.Schlude@gmail.com', email_verified: true, firebase: { identities: { 'google.com': ['1'] } } };
    expect(await isInvited(FAKE_APP, admin)).toBe(true);
    expect(__fakeGuests.reads.count).toBe(0);
  });

  it('ignores the admin claim on any other account', async () => {
    const other = { admin: true, email: 'chef@example.com', email_verified: true, firebase: { identities: { 'google.com': ['2'] } } };
    expect(await isInvited(FAKE_APP, other)).toBe(false);
  });

  it('accepts a verified address on the guest list, regardless of case', async () => {
    invite('tante.erna@gmail.com');
    expect(await isInvited(FAKE_APP, { email: 'Tante.Erna@Gmail.com', email_verified: true })).toBe(true);
  });

  it('rejects addresses that are not on the list', async () => {
    expect(await isInvited(FAKE_APP, { email: 'fremd@gmail.com', email_verified: true })).toBe(false);
  });

  it('rejects unverified addresses even when they are on the list', async () => {
    invite('unverified@gmail.com');
    expect(await isInvited(FAKE_APP, { email: 'unverified@gmail.com', email_verified: false })).toBe(false);
  });

  it('rejects a missing token', async () => {
    expect(await isInvited(FAKE_APP, null)).toBe(false);
  });

  it('caches the answer briefly instead of reading Firestore on every request', async () => {
    invite('cache@gmail.com');
    const token = { email: 'cache@gmail.com', email_verified: true };
    await isInvited(FAKE_APP, token);
    await isInvited(FAKE_APP, token);
    expect(__fakeGuests.reads.count).toBe(1);
  });
});
