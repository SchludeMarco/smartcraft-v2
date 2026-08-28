import { beforeEach, describe, expect, it, vi } from 'vitest';

// Gleiches In-Memory-Firestore-Double wie in api/gemini.test.js/api/tts.test.js
// — reicht aus, um checkRateLimit()/simplifyResults() ohne echtes Firestore-
// Projekt zu testen.
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

const { checkRateLimit, simplifyResults } = await import('./geocode.js');
const { __clearFakeFirestoreStore } = await import('firebase-admin/firestore');

const FAKE_APP = {};

beforeEach(() => {
  __clearFakeFirestoreStore();
  vi.useRealTimers();
});

describe('checkRateLimit', () => {
  it('allows requests within the per-minute burst limit', async () => {
    const ip = 'ip-burst-ok';
    for (let i = 0; i < 15; i++) {
      expect(await checkRateLimit(FAKE_APP, ip)).toBe(true);
    }
  });

  it('rejects the 16th request within the same minute (burst limit = 15)', async () => {
    const ip = 'ip-burst-exceed';
    for (let i = 0; i < 15; i++) {
      await checkRateLimit(FAKE_APP, ip);
    }
    expect(await checkRateLimit(FAKE_APP, ip)).toBe(false);
  });

  it('resets the per-minute window once it has elapsed', async () => {
    vi.useFakeTimers();
    const ip = 'ip-window-reset';
    vi.setSystemTime(0);
    for (let i = 0; i < 15; i++) {
      await checkRateLimit(FAKE_APP, ip);
    }
    expect(await checkRateLimit(FAKE_APP, ip)).toBe(false);

    vi.setSystemTime(61_000); // just past the 60s window
    expect(await checkRateLimit(FAKE_APP, ip)).toBe(true);
  });

  it('keeps different IPs isolated from each other', async () => {
    for (let i = 0; i < 15; i++) {
      await checkRateLimit(FAKE_APP, 'ip-a');
    }
    expect(await checkRateLimit(FAKE_APP, 'ip-a')).toBe(false);
    expect(await checkRateLimit(FAKE_APP, 'ip-b')).toBe(true);
  });
});

describe('simplifyResults', () => {
  it('maps Google Geocoding results to {address, lat, lng}', () => {
    const results = simplifyResults([
      { formatted_address: 'Musterstraße 12, 12345 Musterstadt', geometry: { location: { lat: 52.1, lng: 13.4 } } },
    ]);
    expect(results).toEqual([{ address: 'Musterstraße 12, 12345 Musterstadt', lat: 52.1, lng: 13.4 }]);
  });

  it('drops entries missing an address or coordinates', () => {
    const results = simplifyResults([
      { formatted_address: '', geometry: { location: { lat: 52.1, lng: 13.4 } } },
      { formatted_address: 'Ohne Koordinaten', geometry: {} },
      { formatted_address: 'Vollständig', geometry: { location: { lat: 1, lng: 2 } } },
    ]);
    expect(results).toEqual([{ address: 'Vollständig', lat: 1, lng: 2 }]);
  });

  it('caps the result list at 5 entries', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      formatted_address: `Adresse ${i}`,
      geometry: { location: { lat: i, lng: i } },
    }));
    expect(simplifyResults(many)).toHaveLength(5);
  });

  it('handles a missing/empty input gracefully', () => {
    expect(simplifyResults(undefined)).toEqual([]);
    expect(simplifyResults([])).toEqual([]);
  });
});
