import crypto from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp, verifyAppCheck } from './_lib/adminApp.js';
import { isSameOriginRequest } from './_lib/sameOrigin.js';
import { checkFixedWindowRateLimit } from './_lib/rateLimit.js';
import { PREMIUM_TTS_DAILY_MAX } from '../shared/ttsQuota.js';

// Premium-Vorlesen (Google Cloud TTS) ist allen angemeldeten Google-Nutzern
// zugänglich (Kostenschutz kommt über das Tageskontingent unten, nicht mehr
// über ein einzelnes erlaubtes Konto). Nicht angemeldete/anonyme Nutzer
// bekommen serverseitig weiterhin kein Premium-Audio — sie laufen im Client
// gar nicht erst gegen diesen Endpoint, sondern gegen die browsereigene
// Web Speech API (siehe src/App.jsx).

// Google-Zertifikate zur ID-Token-Prüfung: öffentlicher, unauthentifizierter
// Endpunkt — dafür ist kein FIREBASE_SERVICE_ACCOUNT_KEY nötig (das Prüfen
// eines ID-Tokens erfordert im Gegensatz zum Ausstellen keinen Service-Account,
// siehe https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library).
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certCache = { certs: null, expiresAt: 0 };

async function getGoogleCerts() {
  if (certCache.certs && Date.now() < certCache.expiresAt) return certCache.certs;
  const upstream = await fetch(GOOGLE_CERTS_URL);
  if (!upstream.ok) throw new Error('Google-Zertifikate konnten nicht geladen werden');
  const certs = await upstream.json();
  certCache = { certs, expiresAt: Date.now() + 60 * 60 * 1000 };
  return certs;
}

function base64UrlToBuffer(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Verifiziert Signatur + Standard-Claims eines Firebase-ID-Tokens manuell
// (RS256 gegen Googles öffentliche Zertifikate). Gibt bei Erfolg die
// Token-Payload zurück (u.a. email/email_verified), sonst null.
export async function verifyFirebaseIdToken(idToken, projectId) {
  if (!idToken || !projectId) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  let header, payload;
  try {
    header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || !header.kid) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (payload.aud !== projectId) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) return null;
  if (!payload.sub) return null;

  let certs;
  try {
    certs = await getGoogleCerts();
  } catch {
    return null;
  }
  const cert = certs[header.kid];
  if (!cert) return null;

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  const isValid = verifier.verify(cert, base64UrlToBuffer(signatureB64));
  return isValid ? payload : null;
}

// Google liefert für de-DE-Stimmen durchgängig A=weiblich, B=männlich (gilt
// für Standard-, WaveNet- und Neural2-Stimmen gleichermaßen). WaveNet klingt
// deutlich natürlicher als Standard und ist im kostenlosen Kontingent von
// Google Cloud enthalten (Stand: 1 Mio. Zeichen/Monat gratis für WaveNet).
const VOICE_BY_GENDER = {
  male: 'de-DE-Wavenet-B',
  female: 'de-DE-Wavenet-A',
};
const LANGUAGE_CODE = 'de-DE';

// Google Cloud Text-to-Speech erlaubt max. 5000 Byte Eingabetext pro Anfrage
// (input.text) — mit Marge darunter bleiben und an Satzenden aufteilen, statt
// mitten im Wort abzuschneiden.
const TTS_CHUNK_MAX_BYTES = 4500;

// Eigenes, von /api/gemini unabhängiges Rate-Limit (eigene Firestore-Collection),
// damit ein TTS-Burst (Kurz + Vollständig + Geschlechtswechsel) nicht das
// Gemini-Kontingent derselben IP mitverbraucht und umgekehrt.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 10;
const RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_DAY = 100;

// getAdminApp/verifyAppCheck: siehe ./_lib/adminApp.js (geteilt über alle
// /api/*-Endpoints hinweg). Gleiches Fail-open-Muster wie api/gemini.js —
// ohne FIREBASE_SERVICE_ACCOUNT_KEY bleiben App Check/Rate-Limiting aus,
// statt den Endpoint zu blockieren.

export async function checkRateLimit(app, ip) {
  return checkFixedWindowRateLimit(app, '_ttsRateLimits', ip, {
    maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
    maxPerDay: RATE_LIMIT_MAX_PER_DAY,
    windowMs: RATE_LIMIT_WINDOW_MS,
    dayMs: RATE_LIMIT_DAY_MS,
  });
}

// Tages-Kontingent pro Nutzer (uid aus dem verifizierten ID-Token, nicht vom
// Client) — eigene Collection, getrennt von der IP-basierten Missbrauchs-
// bremse oben: Die hier zählt, wie viel Premium-Audio ein einzelnes Google-
// Konto pro Tag "verdient" hat, unabhängig davon, von welcher IP es kommt.
export async function checkPremiumQuota(app, uid) {
  const db = getFirestore(app);
  const ref = db.collection('_ttsPremiumQuota').doc(uid);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    let { dayStart = 0, dayCount = 0 } = data;
    if (now - dayStart > RATE_LIMIT_DAY_MS) {
      dayStart = now;
      dayCount = 0;
    }
    dayCount += 1;
    const allowed = dayCount <= PREMIUM_TTS_DAILY_MAX;
    tx.set(ref, { dayStart, dayCount }, { merge: true });
    return { allowed, remaining: Math.max(0, PREMIUM_TTS_DAILY_MAX - dayCount) };
  });
}

// Zerlegt Text an Satzenden in Häppchen unter TTS_CHUNK_MAX_BYTES, damit auch
// lange Diagnosetexte (> 5000 Byte) als mehrere Anfragen an Google Cloud gehen.
export function chunkText(text) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && Buffer.byteLength(current + sentence, 'utf8') > TTS_CHUNK_MAX_BYTES) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Nur Requests vom eigenen Frontend akzeptieren — verhindert, dass fremde
  // Seiten diesen Endpoint als kostenlosen TTS-Proxy missbrauchen.
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Premium-Vorlesen erfordert ein echtes (nicht-anonymes) Google-Konto —
  // Nachweis über das mit dem Request mitgeschickte Firebase-ID-Token
  // (Authorization: Bearer <token>), nicht über eine vom Client behauptete
  // E-Mail-Adresse. `firebase.sign_in_provider` ist ein Standard-Claim in
  // jedem Firebase-ID-Token und unterscheidet zuverlässig anonyme Sessions
  // (Provider "anonymous") von echten Logins.
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const decoded = await verifyFirebaseIdToken(idToken, projectId).catch(() => null);
  if (!decoded || decoded.email_verified !== true || decoded.firebase?.sign_in_provider === 'anonymous') {
    res.status(403).json({ error: 'Forbidden: Premium-Sprachausgabe erfordert eine Anmeldung' });
    return;
  }

  const app = getAdminApp();
  if (app) {
    const appCheckOk = await verifyAppCheck(req, app);
    if (!appCheckOk) {
      res.status(401).json({ error: 'Forbidden: invalid App Check token' });
      return;
    }
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const withinLimit = await checkRateLimit(app, ip);
    if (!withinLimit) {
      res.status(429).json({ error: 'Too many requests', code: 'rate_limited' });
      return;
    }
    const { allowed: withinQuota, remaining } = await checkPremiumQuota(app, decoded.sub);
    res.setHeader('X-Tts-Premium-Remaining', String(remaining));
    if (!withinQuota) {
      res.status(429).json({ error: 'Premium-Kontingent erreicht', code: 'quota_exceeded' });
      return;
    }
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT_KEY nicht gesetzt — App Check/Rate-Limiting/Kontingent deaktiviert.');
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server misconfigured: GOOGLE_TTS_API_KEY missing' });
    return;
  }

  const { text, gender } = req.body || {};
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Missing text' });
    return;
  }
  const voiceName = VOICE_BY_GENDER[gender] || VOICE_BY_GENDER.male;

  try {
    const audioChunks = [];
    for (const chunk of chunkText(text)) {
      const upstream = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: chunk },
          voice: { languageCode: LANGUAGE_CODE, name: voiceName },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: data.error?.message || 'Upstream TTS request failed' });
        return;
      }
      audioChunks.push(data.audioContent);
    }
    res.status(200).json({ audioChunks });
  } catch (error) {
    res.status(502).json({ error: 'Upstream TTS request failed' });
  }
}
