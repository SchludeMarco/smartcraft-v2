import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { DEMO_LIFETIME_MAX } from '../shared/demoLimit.js';

// Ohne diese Angabe gilt Vercels Default-Timeout von 10s für Serverless
// Functions. Das reichte knapp, solange App Check/Rate-Limiting fail-open
// (inaktiv) liefen — mit aktivem App Check (Firebase-Verifikation) + Firestore-
// Transaktion für den Rate-Limit-Zähler VOR dem eigentlichen (oft mehrere
// Sekunden dauernden) Gemini-Vision-Aufruf reißt das 10s-Limit regelmäßig
// (sichtbar als plattformseitiges 503 ohne eigene Fehlermeldung im Log).
export const config = { maxDuration: 30 };

// "latest"-Alias statt fest datiertem Modellnamen, damit die App nicht erneut
// durch eine Modell-Abschaltung bricht (siehe Git-Historie: gemini-2.5-flash-preview-09-2025
// und gemini-2.5-flash wurden beide bereits zurückgezogen).
//
// "-lite" statt des einfachen "gemini-flash-latest": Am 24.8.2026 direkt gegen
// Google getestet (siehe error_log.md) - gemini-flash-latest hing zu diesem
// Zeitpunkt komplett (0 Bytes nach 40-60s, mehrfach reproduziert), das
// gepinnte Nachfolgemodell gemini-3.6-flash antwortete zwar, brauchte aber
// als "Thinking"-Modell 24s allein für ein triviales "Hallo" - zu knapp für
// die 30s maxDuration oben, sobald App-Check/Firestore-Overhead dazukommt.
// gemini-flash-lite-latest antwortete im selben Test in 0-3s bei
// gleichbleibend guter Qualität.
const MODEL_NAME = 'gemini-flash-lite-latest';

// Rate-Limit-Fenster: 12/Minute deckt einen legitimen Burst (Hauptanalyse +
// die 4 Zusatz-Tools) locker ab, 200/Tag bremst zusätzlich Slow-Drip-Missbrauch.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 12;
const RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_DAY = 200;

// DEMO_LIFETIME_MAX (siehe shared/demoLimit.js): anders als die beiden Fenster
// oben läuft dieser Zähler nie zurück — er deckelt, wie oft dieselbe IP diesen
// Endpoint INSGESAMT nutzen darf. Gedacht für den öffentlichen (z.B.
// LinkedIn-)Link ohne Login: einzelne Besucher können die App voll
// ausprobieren, aber niemand betreibt sie dauerhaft kostenlos über den
// eigenen Account weiter.

// Lazy-Init: Admin-App nur aufbauen, wenn ein Service-Account hinterlegt ist.
// Ohne FIREBASE_SERVICE_ACCOUNT_KEY bleiben App Check/Rate-Limiting aus
// (fail-open), damit der Endpoint nach dem Deploy nicht bricht, bevor die
// Firebase/Vercel-Konfiguration nachgezogen wurde (siehe README).
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

// Erkennt einen echten Admin-Account über das Firebase-ID-Token (Authorization:
// Bearer <token>) + Custom Claim "admin: true" (gesetzt per
// scripts/set-admin-claim.mjs, nie im Code/Repo hinterlegt). Fehlt das Token,
// ist es ungültig oder fehlt der Claim, gilt der Request als normaler
// Demo-Nutzer — kein Fallback, kein Klartext-Secret.
async function isAdminRequest(req, app) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return false;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return decoded.admin === true;
  } catch {
    return false;
  }
}

// Fixed-Window-Zähler pro IP in Firestore (_rateLimits/{ip}), atomar per
// Transaktion aktualisiert. Diese Collection ist nicht in firestore.rules
// erwähnt und damit für das Client-SDK automatisch unerreichbar (Default-Deny).
// Liefert neben "allowed" auch "demoExceeded", damit der Handler das
// Demo-Kontingent (dauerhaft) von normalem Burst-Throttling (temporär)
// unterscheiden und jeweils passend antworten kann. "remaining" (Kontingent
// nach dieser Anfrage) geht als X-Demo-Remaining-Header an den Client, damit
// die App live anzeigen kann, wie viele Anfragen noch übrig sind.
async function checkRateLimit(app, ip) {
  const db = getFirestore(app);
  const ref = db.collection('_rateLimits').doc(ip);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    let { minuteStart = 0, minuteCount = 0, dayStart = 0, dayCount = 0, lifetimeCount = 0 } = data;
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
    lifetimeCount += 1;
    const demoExceeded = lifetimeCount > DEMO_LIFETIME_MAX;
    const withinWindows = minuteCount <= RATE_LIMIT_MAX_PER_WINDOW && dayCount <= RATE_LIMIT_MAX_PER_DAY;
    tx.set(ref, { minuteStart, minuteCount, dayStart, dayCount, lifetimeCount }, { merge: true });
    const remaining = Math.max(0, DEMO_LIFETIME_MAX - lifetimeCount);
    return { allowed: withinWindows && !demoExceeded, demoExceeded, remaining };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Kompletter Handler-Body in einem try/catch: checkRateLimit() (Firestore-
  // Transaktion) und verifyAppCheck() konnten bislang unbehandelt durchschlagen
  // und die Function mit einem plattformseitigen 503 ohne jede eigene
  // Fehlermeldung im Log abstürzen lassen. Jetzt landet jeder unerwartete
  // Fehler als sauberes JSON mit Log-Zeile statt eines stillen Crashs.
  try {
    // Nur Requests akzeptieren, die tatsächlich vom eigenen Frontend kommen
    // (verhindert, dass fremde Seiten diesen Endpoint als kostenlosen
    // Gemini-Proxy missbrauchen und das API-Kontingent/Kosten verursachen).
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

    // App Check + Rate-Limiting: nur aktiv, wenn ein Service-Account
    // konfiguriert ist (siehe getAdminApp). Sonst unverändertes Verhalten.
    const app = getAdminApp();
    if (app) {
      const appCheckOk = await verifyAppCheck(req, app);
      if (!appCheckOk) {
        res.status(401).json({ error: 'Forbidden: invalid App Check token' });
        return;
      }
      const isAdmin = await isAdminRequest(req, app);
      if (isAdmin) {
        // Echtes Admin-Konto (Custom Claim, siehe isAdminRequest): weder
        // IP-Rate-Limit noch Demo-Lifetime-Kontingent gelten hier — bewusst
        // vor checkRateLimit(), damit der eigene Account auch dessen
        // Fenster-Zähler nicht mitverbraucht.
        res.setHeader('X-Demo-Remaining', 'unlimited');
      } else {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
        const { allowed, demoExceeded, remaining } = await checkRateLimit(app, ip);
        // Geht als X-Demo-Remaining-Header auf jede Antwort dieses Handlers raus
        // (Erfolg wie Fehler), damit die App live anzeigen kann, wie viele
        // Anfragen noch übrig sind.
        res.setHeader('X-Demo-Remaining', String(remaining));
        if (!allowed) {
          if (demoExceeded) {
            // 403 statt 429: fetchWithRetry im Client behandelt 429 als
            // vorübergehend und wiederholt automatisch — das Demo-Kontingent ist
            // aber endgültig aufgebraucht, ein Retry würde nur unnötig warten.
            res.status(403).json({
              error: `Demo-Kontingent erreicht: Diese öffentliche Vorschau ist auf ${DEMO_LIFETIME_MAX} KI-Anfragen pro Besucher begrenzt. Danke fürs Ausprobieren!`,
            });
          } else {
            res.status(429).json({ error: 'Too many requests' });
          }
          return;
        }
      }
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT_KEY nicht gesetzt — App Check/Rate-Limiting deaktiviert.');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server misconfigured: GEMINI_API_KEY missing' });
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const text = await upstream.text();
      res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text);
    } catch (error) {
      console.error('Upstream-Gemini-Aufruf fehlgeschlagen:', error);
      res.status(502).json({ error: 'Upstream Gemini request failed' });
    }
  } catch (error) {
    console.error('Unerwarteter Fehler in /api/gemini:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error: ' + (error?.message || String(error)) });
    }
  }
}
