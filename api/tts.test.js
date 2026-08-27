import { createSign, generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chunkText, verifyFirebaseIdToken } from './tts.js';

const PROJECT_ID = 'smartcraft-test-project';
const KID = 'test-kid-1';

let publicKeyPem;
let privateKeyPem;

const base64url = (value) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').toString('base64url');

// Builds a self-signed Firebase-style ID token (header.payload.signature) so
// verifyFirebaseIdToken's hand-rolled RS256 check can be exercised without a
// real Firebase project. `crypto.verify` accepts a plain SPKI public key PEM
// as the verification key (it doesn't require a wrapping X.509 certificate),
// so the generated key pair's public key can stand in for Google's cert.
function signIdToken(payloadOverrides = {}, headerOverrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    iat: now,
    exp: now + 3600,
    sub: 'user-123',
    ...payloadOverrides,
  };
  const header = { alg: 'RS256', kid: KID, ...headerOverrides };
  const headerB64 = base64url(header);
  const payloadB64 = base64url(payload);
  const signature = createSign('RSA-SHA256')
    .update(`${headerB64}.${payloadB64}`)
    .sign(privateKeyPem)
    .toString('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

beforeAll(() => {
  const keyPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  publicKeyPem = keyPair.publicKey;
  privateKeyPem = keyPair.privateKey;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ [KID]: publicKeyPem }) }))
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('verifyFirebaseIdToken', () => {
  it('returns the token payload for a validly signed token', async () => {
    const result = await verifyFirebaseIdToken(signIdToken(), PROJECT_ID);
    expect(result).not.toBeNull();
    expect(result.sub).toBe('user-123');
  });

  it('rejects when the token or project id is missing', async () => {
    expect(await verifyFirebaseIdToken('', PROJECT_ID)).toBeNull();
    expect(await verifyFirebaseIdToken(signIdToken(), '')).toBeNull();
  });

  it('rejects a malformed token (not three dot-separated parts)', async () => {
    expect(await verifyFirebaseIdToken('not-a-jwt', PROJECT_ID)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signIdToken({ exp: now - 10 });
    expect(await verifyFirebaseIdToken(token, PROJECT_ID)).toBeNull();
  });

  it('rejects a token issued too far in the future', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signIdToken({ iat: now + 120 }); // beyond the 60s clock-skew allowance
    expect(await verifyFirebaseIdToken(token, PROJECT_ID)).toBeNull();
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = signIdToken({ iss: 'https://securetoken.google.com/some-other-project' });
    expect(await verifyFirebaseIdToken(token, PROJECT_ID)).toBeNull();
  });

  it('rejects a token with the wrong audience', async () => {
    const token = signIdToken({ aud: 'some-other-project' });
    expect(await verifyFirebaseIdToken(token, PROJECT_ID)).toBeNull();
  });

  it('rejects a token with no subject claim', async () => {
    const token = signIdToken({ sub: undefined });
    expect(await verifyFirebaseIdToken(token, PROJECT_ID)).toBeNull();
  });

  it('rejects a token signed with an unknown key id', async () => {
    const token = signIdToken({}, { kid: 'unknown-kid' });
    expect(await verifyFirebaseIdToken(token, PROJECT_ID)).toBeNull();
  });

  it('rejects a token whose header algorithm is not RS256', async () => {
    const token = signIdToken({}, { alg: 'none' });
    expect(await verifyFirebaseIdToken(token, PROJECT_ID)).toBeNull();
  });

  it('rejects a token whose payload was tampered with after signing', async () => {
    const [headerB64, payloadB64, signatureB64] = signIdToken().split('.');
    const tamperedPayload = base64url({
      ...JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')),
      sub: 'attacker-controlled-uid',
    });
    const tampered = `${headerB64}.${tamperedPayload}.${signatureB64}`;
    expect(await verifyFirebaseIdToken(tampered, PROJECT_ID)).toBeNull();
  });
});

describe('chunkText', () => {
  it('keeps short text as a single chunk', () => {
    expect(chunkText('Hallo Welt.')).toEqual(['Hallo Welt.']);
  });

  it('splits long text into multiple chunks, each within the byte budget', () => {
    const sentence = 'Dies ist ein Testsatz mit ein paar Woertern. ';
    const text = sentence.repeat(200); // well beyond the 4500-byte chunk limit
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThanOrEqual(4500);
    }
  });

  it('counts multi-byte UTF-8 characters (German umlauts) correctly when chunking', () => {
    // Umlauts are 2 bytes each in UTF-8 - a naive character-count-based split
    // would under-count and let a chunk exceed the byte budget.
    const sentence = 'Fünf Ölöfen müssen überprüft und gesäubert werden. ';
    const text = sentence.repeat(150);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThanOrEqual(4500);
    }
  });

  it('falls back to a single chunk when nothing matches the sentence pattern', () => {
    expect(chunkText('')).toEqual(['']);
  });
});
