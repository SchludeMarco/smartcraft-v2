import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_LIFETIME_MAX } from '../shared/demoLimit.js';

// checkRateLimit runs a Firestore transaction per call —
// this fake implements just enough of the Admin SDK surface (collection/doc/
// runTransaction with tx.get/tx.set) to exercise the counting logic without a
// real Firestore project. The in-memory store is keyed by doc path so
// different ip/uid values in the same test file stay isolated from each other.
vi.mock('firebase-admin/firestore', () => {
  const store = new Map();
  const tx = {
    get: async (ref) => ({ exists: store.has(ref.path), data: () => store.get(ref.path) }),
    set: (ref, data, opts) => {
      const prev = store.get(ref.path) || {};
      store.set(ref.path, opts?.merge ? { ...prev, ...data } : data);
    },
  };
  return {
    getFirestore: () => ({
      collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
      runTransaction: async (fn) => fn(tx),
    }),
    __clearFakeFirestoreStore: () => store.clear(),
  };
});

const { checkRateLimit } = await import('./gemini.js');
const { __clearFakeFirestoreStore } = await import('firebase-admin/firestore');

const FAKE_APP = {};

beforeEach(() => {
  __clearFakeFirestoreStore();
  vi.useRealTimers();
});

describe('checkRateLimit', () => {
  it('allows requests within the per-minute burst limit', async () => {
    const ip = 'ip-burst-ok';
    for (let i = 0; i < 12; i++) {
      const { allowed } = await checkRateLimit(FAKE_APP, ip, false);
      expect(allowed).toBe(true);
    }
  });

  it('rejects the 13th request within the same minute (burst limit = 12)', async () => {
    const ip = 'ip-burst-exceed';
    for (let i = 0; i < 12; i++) {
      await checkRateLimit(FAKE_APP, ip, false);
    }
    const { allowed } = await checkRateLimit(FAKE_APP, ip, false);
    expect(allowed).toBe(false);
  });

  it('resets the per-minute window once it has elapsed', async () => {
    vi.useFakeTimers();
    const ip = 'ip-window-reset';
    vi.setSystemTime(0);
    for (let i = 0; i < 12; i++) {
      await checkRateLimit(FAKE_APP, ip, false);
    }
    expect((await checkRateLimit(FAKE_APP, ip, false)).allowed).toBe(false);

    vi.setSystemTime(61_000); // just past the 60s window
    expect((await checkRateLimit(FAKE_APP, ip, false)).allowed).toBe(true);
  });

  it('does not enforce the lifetime demo cap for logged-in users (applyLifetimeCap=false)', async () => {
    vi.useFakeTimers();
    const ip = 'ip-no-lifetime-cap';
    let time = 0;
    let result;
    // Advance past the minute window on every call so only the lifetime cap
    // itself is under test, not the burst limit.
    for (let i = 0; i < DEMO_LIFETIME_MAX + 5; i++) {
      vi.setSystemTime(time);
      result = await checkRateLimit(FAKE_APP, ip, false);
      time += 61_000;
    }
    expect(result.allowed).toBe(true);
    expect(result.demoExceeded).toBe(false);
    expect(result.remaining).toBeNull();
  });

  it('enforces the lifetime demo cap once it is exceeded (applyLifetimeCap=true)', async () => {
    vi.useFakeTimers();
    const ip = 'ip-lifetime-cap';
    let time = 0;
    let result;
    for (let i = 0; i < DEMO_LIFETIME_MAX + 1; i++) {
      vi.setSystemTime(time);
      result = await checkRateLimit(FAKE_APP, ip, true);
      time += 61_000;
    }
    expect(result.demoExceeded).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
