import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { FREE_TRIAL_MAX } from '../shared/trialLimit.js';

// Rein lesender Zwilling zu api/gemini.js: liest den aktuellen Stand des
// Pro-Konto-Kontingents (_analysisQuota/{uid}.count), ohne ihn zu erhöhen.
// Wird beim App-Start (nach dem Login) aufgerufen, damit der Nutzer schon vor
// der ersten Analyse sieht, wie viele kostenlose Analysen noch übrig sind —
// analog zu api/demo-status.js, aber pro Konto (uid aus dem ID-Token) statt
// pro IP, siehe api/gemini.js für die Begründung.

// Lazy-Init: gleiches Fail-open-Muster wie api/gemini.js/api/demo-status.js —
// ohne FIREBASE_SERVICE_ACCOUNT_KEY bleibt der Live-Zähler aus (Client zeigt
// dann die statische Obergrenze), statt den Endpoint zu blockieren.
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Nur Requests vom eigenen Frontend akzeptieren, gleiches Muster wie
  // api/demo-status.js (inkl. Referer-Fallback für GET ohne Origin-Header).
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
    res.status(200).json({ max: FREE_TRIAL_MAX, remaining: null });
    return;
  }

  const appCheckOk = await verifyAppCheck(req, app);
  if (!appCheckOk) {
    res.status(401).json({ error: 'Forbidden: invalid App Check token' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    res.status(200).json({ max: FREE_TRIAL_MAX, remaining: FREE_TRIAL_MAX });
    return;
  }
  let uid;
  try {
    uid = (await getAuth(app).verifyIdToken(idToken)).uid;
  } catch {
    res.status(200).json({ max: FREE_TRIAL_MAX, remaining: FREE_TRIAL_MAX });
    return;
  }

  const snap = await getFirestore(app).collection('_analysisQuota').doc(uid).get();
  const count = snap.exists ? (snap.data().count || 0) : 0;
  const remaining = Math.max(0, FREE_TRIAL_MAX - count);
  res.status(200).json({ max: FREE_TRIAL_MAX, remaining });
}
