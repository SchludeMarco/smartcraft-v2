import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp, verifyAppCheck } from './_lib/adminApp.js';
import { isSameOriginRequest } from './_lib/sameOrigin.js';
import { checkFixedWindowRateLimit } from './_lib/rateLimit.js';
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
const RATE_LIMIT_MAX_PER_WINDOW = 5;
const RATE_LIMIT_MAX_PER_DAY = 50;

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
  if (!isSameOriginRequest(req, { allowRefererFallback: true })) {
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
  const withinLimit = await checkFixedWindowRateLimit(app, '_rateLimits', `appstart_${ip}`, {
    maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
    maxPerDay: RATE_LIMIT_MAX_PER_DAY,
  });
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
