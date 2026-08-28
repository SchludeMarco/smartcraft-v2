import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Serverless-Proxy zur Google Geocoding API — reverse (GPS -> Adresse) und
// vorwärts (Adress-Suchbegriff -> Kandidaten samt Koordinaten) fürs
// Bestätigen/Festlegen des Standorts (siehe SiteAddressModal in src/App.jsx).
// Gleicher Grund wie bei api/gemini.js/api/tts.js: der Google-API-Key darf
// nie im Browser sichtbar sein.

// Reine Lookup-Anfragen, kein teurer KI-Aufruf wie /api/gemini — trotzdem ein
// eigenes, eher enges Limit, da die Geocoding API pro Anfrage kostet.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 15;
const RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_DAY = 150;

// Bei mehrdeutigen Adress-Suchen (z.B. eine häufige Straße ohne Ort) liefert
// Google mehrere Treffer — mehr als eine Handvoll braucht die Auswahl im UI
// nicht.
const MAX_RESULTS = 5;

// Lazy-Init: Admin-App nur aufbauen, wenn ein Service-Account hinterlegt ist.
// Gleiches Fail-open-Muster wie api/gemini.js/api/tts.js.
let adminApp = null;
let adminInitTried = false;
function getAdminApp() {
  if (adminApp || adminInitTried) return adminApp;
  adminInitTried = true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    adminApp = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
  } catch (e) {
    console.error('Firebase-Admin-Initialisierung fehlgeschlagen:', e);
    adminApp = null;
  }
  return adminApp;
}

async function verifyAppCheck(req, app) {
  const token = req.headers['x-firebase-appcheck'];
  if (!token) return false;
  try {
    await getAppCheck(app).verifyToken(token);
    return true;
  } catch {
    return false;
  }
}

// Anders als bei /api/gemini ist hier kein anonymer Fallback-Pfad nötig: die
// App erzwingt ohnehin ein Google-Login, bevor überhaupt eine Analyse
// möglich ist (siehe onAuthStateChanged in src/App.jsx) — ein gültiges
// ID-Token ist damit Voraussetzung, nicht nur optional.
async function getVerifiedUid(req, app) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return null;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}

// Fixed-Window-Zähler pro IP in Firestore (_geocodeRateLimits/{ip}), atomar
// per Transaktion aktualisiert — gleiches Muster wie checkRateLimit in
// api/gemini.js/api/tts.js, nur ohne Lebenszeit-Kontingent.
export async function checkRateLimit(app, ip) {
  const db = getFirestore(app);
  const ref = db.collection('_geocodeRateLimits').doc(ip);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    let { minuteStart = 0, minuteCount = 0, dayStart = 0, dayCount = 0 } = data;
    if (now - minuteStart > RATE_LIMIT_WINDOW_MS) {
      minuteStart = now;
      minuteCount = 0;
    }
    if (now - dayStart > RATE_LIMIT_DAY_MS) {
      dayStart = now;
      dayCount = 0;
    }
    minuteCount += 1;
    dayCount += 1;
    const allowed = minuteCount <= RATE_LIMIT_MAX_PER_WINDOW && dayCount <= RATE_LIMIT_MAX_PER_DAY;
    tx.set(ref, { minuteStart, minuteCount, dayStart, dayCount }, { merge: true });
    return allowed;
  });
}

// Reduziert die Google-Antwort auf das, was das UI tatsächlich braucht (Adresse
// + Koordinaten) statt der vollen, deutlich größeren Geocoding-Antwortstruktur
// (address_components, place_id, plus_code, ...) an den Client durchzureichen.
export function simplifyResults(results) {
  return (results || [])
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      address: r.formatted_address,
      lat: r.geometry?.location?.lat,
      lng: r.geometry?.location?.lng,
    }))
    .filter((r) => typeof r.address === 'string' && r.address && typeof r.lat === 'number' && typeof r.lng === 'number');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Nur Requests vom eigenen Frontend akzeptieren — verhindert, dass fremde
    // Seiten diesen Endpoint als kostenlosen Geocoding-Proxy missbrauchen.
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let originHost = null;
    try {
      originHost = req.headers.origin ? new URL(req.headers.origin).host : null;
    } catch {
      originHost = null;
    }
    if (!originHost || originHost !== host) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { mode, lat, lng, query: addressQuery } = req.body || {};
    if (mode !== 'reverse' && mode !== 'search') {
      res.status(400).json({ error: 'Invalid mode' });
      return;
    }
    if (mode === 'reverse' && (typeof lat !== 'number' || typeof lng !== 'number')) {
      res.status(400).json({ error: 'Missing lat/lng' });
      return;
    }
    if (mode === 'search' && (typeof addressQuery !== 'string' || !addressQuery.trim())) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }

    const app = getAdminApp();
    if (app) {
      const appCheckOk = await verifyAppCheck(req, app);
      if (!appCheckOk) {
        res.status(401).json({ error: 'Forbidden: invalid App Check token' });
        return;
      }
      const uid = await getVerifiedUid(req, app);
      if (!uid) {
        res.status(403).json({ error: 'Forbidden: Anmeldung erforderlich' });
        return;
      }
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      const allowed = await checkRateLimit(app, ip);
      if (!allowed) {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT_KEY nicht gesetzt — App Check/Login-Prüfung/Rate-Limiting bei /api/geocode deaktiviert.');
    }

    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server misconfigured: GOOGLE_GEOCODING_API_KEY missing' });
      return;
    }

    const params = new URLSearchParams({ key: apiKey, language: 'de', region: 'de' });
    if (mode === 'reverse') {
      params.set('latlng', `${lat},${lng}`);
    } else {
      params.set('address', addressQuery.trim());
    }

    const upstream = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
    const data = await upstream.json();
    if (!upstream.ok || (data.status !== 'OK' && data.status !== 'ZERO_RESULTS')) {
      res.status(502).json({ error: data.error_message || `Upstream Geocoding request failed (${data.status})` });
      return;
    }
    res.status(200).json({ results: simplifyResults(data.results) });
  } catch (error) {
    console.error('Unerwarteter Fehler in /api/geocode:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error: ' + (error?.message || String(error)) });
    }
  }
}
