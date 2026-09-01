import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';

// Lazy-Init: Admin-App nur aufbauen, wenn ein Service-Account hinterlegt ist.
// Ohne FIREBASE_SERVICE_ACCOUNT_KEY bleiben App Check/Rate-Limiting aus
// (fail-open), damit ein Endpoint nach dem Deploy nicht bricht, bevor die
// Firebase/Vercel-Konfiguration nachgezogen wurde (siehe README). Jede
// api/*.js-Datei ist auf Vercel eine eigene Serverless Function mit eigenem
// Modul-Scope, daher teilen sich unterschiedliche Endpoints hierüber keinen
// Zustand — dieselbe Semantik wie die vorher pro Datei duplizierte Version.
let adminApp = null;
let adminInitTried = false;
export function getAdminApp() {
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

export async function verifyAppCheck(req, app) {
  const token = req.headers['x-firebase-appcheck'];
  if (!token) return false;
  try {
    await getAppCheck(app).verifyToken(token);
    return true;
  } catch {
    return false;
  }
}
