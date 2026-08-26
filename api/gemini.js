import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, verifyAppCheck } from './_lib/adminApp.js';
import { isSameOriginRequest } from './_lib/sameOrigin.js';
import { DEMO_LIFETIME_MAX } from '../shared/demoLimit.js';
import { FREE_TRIAL_MAX } from '../shared/trialLimit.js';
import { APP_ID } from '../shared/appId.js';

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
// Endpoint INSGESAMT nutzen darf. Gilt nur noch für Requests OHNE gültiges
// Firebase-ID-Token (z.B. ein Direktzugriff am UI vorbei) — echte, per Google
// eingeloggte Nutzer laufen seit V2.7.0 stattdessen über das Pro-Konto-
// Kontingent aus FREE_TRIAL_MAX (siehe shared/trialLimit.js) plus eigenen
// API-Key nach dessen Verbrauch, da ein IP-weites Kontingent mehrere echte
// Nutzer hinter demselben NAT/Firmennetz träfe.

// FREE_TRIAL_MAX (siehe shared/trialLimit.js): kostenloses Kontingent an
// Haupt-Diagnosen pro Konto (Firestore-Zähler _analysisQuota/{uid}, per
// verifiziertem ID-Token). Nur Requests mit dem Header "X-Analysis-Kind: main"
// (siehe callGeminiVisionAPI in App.jsx) erhöhen diesen Zähler — Zusatz-Tools
// verbrauchen keinen eigenen Slot, laufen aber sobald das Kontingent
// aufgebraucht ist ebenfalls über den vom Nutzer hinterlegten eigenen Key.

// getAdminApp/verifyAppCheck: siehe ./_lib/adminApp.js (geteilt über alle
// /api/*-Endpoints hinweg). Ohne FIREBASE_SERVICE_ACCOUNT_KEY bleiben App
// Check/Rate-Limiting aus (fail-open), damit der Endpoint nach dem Deploy
// nicht bricht, bevor die Firebase/Vercel-Konfiguration nachgezogen wurde
// (siehe README).

// Verifiziert das Firebase-ID-Token (Authorization: Bearer <token>) eines
// Requests und liefert uid + Admin-Custom-Claim (gesetzt per
// scripts/set-admin-claim.mjs, nie im Code/Repo hinterlegt). Fehlt das Token
// oder ist es ungültig, liefert die Funktion null — der Request gilt dann als
// nicht authentifiziert (voller IP-basierter Schutz inkl. Demo-Lebenszeit-
// Kontingent, siehe Handler unten). Ersetzt das frühere isAdminRequest(), das
// nur den Admin-Fall kannte — reguläre Nutzer brauchen jetzt ebenfalls die
// verifizierte uid fürs Pro-Konto-Kontingent (FREE_TRIAL_MAX).
async function getVerifiedUser(req, app) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return null;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return { uid: decoded.uid, isAdmin: decoded.admin === true };
  } catch {
    return null;
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
// applyLifetimeCap=false (echte, per Google eingeloggte Nutzer): nur die
// Burst-/Tages-Fenster zählen, das Lebenszeit-Demo-Kontingent bleibt
// unangetastet — das gilt seit V2.7.0 ausschließlich für Requests ohne
// gültiges ID-Token (siehe getVerifiedUser).
export async function checkRateLimit(app, ip, applyLifetimeCap) {
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
    if (applyLifetimeCap) lifetimeCount += 1;
    const demoExceeded = applyLifetimeCap && lifetimeCount > DEMO_LIFETIME_MAX;
    const withinWindows = minuteCount <= RATE_LIMIT_MAX_PER_WINDOW && dayCount <= RATE_LIMIT_MAX_PER_DAY;
    tx.set(ref, { minuteStart, minuteCount, dayStart, dayCount, lifetimeCount }, { merge: true });
    const remaining = applyLifetimeCap ? Math.max(0, DEMO_LIFETIME_MAX - lifetimeCount) : null;
    return { allowed: withinWindows && !demoExceeded, demoExceeded, remaining };
  });
}

// Zählt Haupt-Diagnosen pro Konto (Firestore _analysisQuota/{uid}, per
// verifiziertem ID-Token, nicht vom Client behauptet) fürs kostenlose
// Kontingent aus FREE_TRIAL_MAX. "consume" ist nur bei der Haupt-Diagnose
// true (Header "X-Analysis-Kind: main") — Zusatz-Tools prüfen den Stand nur,
// ohne ihn zu erhöhen, damit sie keinen eigenen Slot verbrauchen.
export async function checkAndConsumeTrial(app, uid, consume) {
  const db = getFirestore(app);
  const ref = db.collection('_analysisQuota').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let { count = 0 } = snap.exists ? snap.data() : {};
    if (consume) {
      count += 1;
      tx.set(ref, { count }, { merge: true });
    }
    return { exceeded: count > FREE_TRIAL_MAX, remaining: Math.max(0, FREE_TRIAL_MAX - count) };
  });
}

// Liest den vom Nutzer selbst hinterlegten Gemini-API-Key aus dessen Profil
// (artifacts/{appId}/users/{uid}/profile/data.geminiApiKey, siehe
// UserProfileModal in App.jsx) — erst relevant, sobald FREE_TRIAL_MAX
// aufgebraucht ist. Firestore Admin SDK umgeht firestore.rules ohnehin;
// dieselben Regeln beschränken den Client-Zugriff auf den Doc-Besitzer.
async function getUserOwnApiKey(app, uid) {
  const db = getFirestore(app);
  const ref = db.collection('artifacts').doc(APP_ID).collection('users').doc(uid)
    .collection('profile').doc('data');
  const snap = await ref.get();
  const key = snap.exists ? snap.data()?.geminiApiKey : null;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
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
    if (!isSameOriginRequest(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // App Check + Rate-Limiting/Kontingent: nur aktiv, wenn ein Service-Account
    // konfiguriert ist (siehe getAdminApp). Sonst unverändertes Verhalten.
    const app = getAdminApp();
    // Eigener API-Key des Nutzers (siehe getUserOwnApiKey) — nur gesetzt,
    // wenn FREE_TRIAL_MAX aufgebraucht ist und ein Key hinterlegt wurde.
    let ownApiKey = null;
    if (app) {
      const appCheckOk = await verifyAppCheck(req, app);
      if (!appCheckOk) {
        res.status(401).json({ error: 'Forbidden: invalid App Check token' });
        return;
      }
      const verifiedUser = await getVerifiedUser(req, app);
      if (verifiedUser?.isAdmin) {
        // Echtes Admin-Konto (Custom Claim, siehe getVerifiedUser): weder
        // IP-Rate-Limit noch irgendein Kontingent gelten hier.
        res.setHeader('X-Demo-Remaining', 'unlimited');
      } else if (verifiedUser?.uid) {
        // Echter, per Google eingeloggter Nutzer: statt des IP-weiten Demo-
        // Lebenszeit-Kontingents (das mehrere Nutzer hinter derselben IP/
        // demselben Firmennetz träfe) gilt hier das Pro-Konto-Kontingent aus
        // FREE_TRIAL_MAX. Das Burst-/Tages-Fenster pro IP bleibt zusätzlich
        // aktiv, als Schutz vor Endlosschleifen/Bugs unabhängig vom Konto.
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
        const { allowed } = await checkRateLimit(app, ip, false);
        if (!allowed) {
          res.status(429).json({ error: 'Too many requests' });
          return;
        }
        const isMainAnalysis = req.headers['x-analysis-kind'] === 'main';
        const { exceeded, remaining } = await checkAndConsumeTrial(app, verifiedUser.uid, isMainAnalysis);
        res.setHeader('X-Trial-Remaining', String(remaining));
        if (exceeded) {
          ownApiKey = await getUserOwnApiKey(app, verifiedUser.uid);
          if (!ownApiKey) {
            // 402 (Payment Required) statt 429: fetchWithRetry im Client
            // wiederholt 429 automatisch, aber das kostenlose Kontingent ist
            // endgültig aufgebraucht — ein Retry hilft erst nach Hinterlegen
            // eines eigenen Keys im Profil (siehe UserProfileModal).
            res.status(402).json({
              error: `Kostenloses Kontingent von ${FREE_TRIAL_MAX} Analysen aufgebraucht. Bitte hinterlegen Sie im Profil einen eigenen Gemini-API-Key, um SmartCraft weiter zu nutzen.`,
            });
            return;
          }
        }
      } else {
        // Kein gültiges ID-Token: Direktzugriff am UI vorbei oder Auth-Fehler
        // — hier greift weiterhin der volle IP-basierte Schutz inklusive
        // Demo-Lebenszeit-Kontingent (siehe checkRateLimit).
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
        const { allowed, demoExceeded, remaining } = await checkRateLimit(app, ip, true);
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
      console.warn('FIREBASE_SERVICE_ACCOUNT_KEY nicht gesetzt — App Check/Rate-Limiting/Kontingent-Prüfung deaktiviert.');
    }

    const apiKey = ownApiKey || process.env.GEMINI_API_KEY;
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
