import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { APP_ID } from '../shared/appId.js';

// Protokolliert App-Starts für den Admin-Bereich: ein Eintrag pro Start mit
// Zeitstempel + grober Region (Land/Stadt aus Vercels Geo-Headern) - die IP
// selbst wird nirgends gespeichert. Bewusst gröber als GPS: Vercels Header
// lösen nur bis Stadt-Ebene auf.
//
// Optional wird zusätzlich die anonyme Firebase-UID des Aufrufers mitgeloggt
// (aus dem Authorization-Bearer-Token, verifiziert statt vom Client
// übernommen) - dieselbe UID, die src/App.jsx ohnehin für die
// Verlaufs-Funktion anlegt, keine neue Kennung. Damit lassen sich
// wiederkehrende Geräte an derselben UID erkennen, ohne Name/E-Mail - solange
// sich die Person nicht per Google anmeldet. Fehlt/ist ungültig das Token,
// wird trotzdem geloggt, nur ohne visitorId (rein informatives Feature, darf
// den App-Start nicht blockieren).

// Gleiches Lazy-Init/Fail-open-Muster wie api/gemini.js: ohne Service-Account
// bleiben App Check/Firestore aus, statt den App-Start selbst zu blockieren.
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

// Liefert die verifizierte UID bei gültigem Token, sonst null - nie ein
// Grund, den Request abzulehnen (siehe Kommentar oben).
async function verifyVisitorUid(req, app) {
  const authHeader = req.headers['authorization'] || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return null;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}

// Rein informativer Zähler, kein regulärer User-Flow pro Request nötig -
// gleiche Größenordnung wie das Bug-Report-Limit in api/report-bug.js, damit
// ein einzelnes Gerät die Tages-Zähler nicht künstlich aufblasen kann.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 5;
const RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_DAY = 50;

async function checkRateLimit(app, ip) {
  const db = getFirestore(app);
  const ref = db.collection('_rateLimits').doc(`appstart_${ip}`);
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

// Vercels Geo-Header sind URI-kodiert (z.B. "M%C3%BCnchen") und dürfen als
// Firestore-Map-Key keine Sonderzeichen wie ".", "/", "[", "]" enthalten.
const sanitizeLocationPart = (value) => {
  if (!value) return null;
  try {
    return decodeURIComponent(value).replace(/[.#$/[\]]/g, '').slice(0, 60) || null;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Gleicher Same-Origin-Schutz wie api/gemini.js / api/report-bug.js.
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let originHost = null;
  try {
    originHost = req.headers.origin ? new URL(req.headers.origin).host : null;
  } catch {
    originHost = null;
  }
  if (!originHost) {
    try {
      originHost = req.headers.referer ? new URL(req.headers.referer).host : null;
    } catch {
      originHost = null;
    }
  }
  if (!originHost || originHost !== host) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const app = getAdminApp();
  if (!app) {
    // Ohne Service-Account kein Firestore-Zugriff möglich - rein informatives
    // Feature, darf den App-Start selbst nicht beeinträchtigen.
    res.status(200).json({ ok: true, skipped: 'no-admin-app' });
    return;
  }

  const appCheckOk = await verifyAppCheck(req, app);
  if (!appCheckOk) {
    res.status(401).json({ error: 'Forbidden: invalid App Check token' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const withinLimit = await checkRateLimit(app, ip);
  if (!withinLimit) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  // Vercel liefert diese Header automatisch bei jedem Request mit - grobe
  // Geo-Auflösung serverseitig, ohne externen Geolocation-Dienst und ohne
  // dass die IP selbst irgendwo gespeichert wird.
  const country = sanitizeLocationPart(req.headers['x-vercel-ip-country']) || 'Unbekannt';
  const city =
    sanitizeLocationPart(req.headers['x-vercel-ip-city']) ||
    sanitizeLocationPart(req.headers['x-vercel-ip-country-region']) ||
    'Unbekannt';

  const visitorId = await verifyVisitorUid(req, app);

  const db = getFirestore(app);
  try {
    const entry = { timestamp: Date.now(), country, city };
    if (visitorId) entry.visitorId = visitorId;
    await db.collection('artifacts').doc(APP_ID).collection('appStarts').add(entry);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('App-Start-Log fehlgeschlagen:', e);
    res.status(500).json({ error: 'Failed to record app start' });
  }
}
