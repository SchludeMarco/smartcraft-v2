import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';

// Gemeinsame Firebase-Admin-Initialisierung für alle /api/*-Endpoints. Vorher
// in jeder Datei einzeln (byte-identisch) dupliziert.
//
// Lazy-Init: Admin-App nur aufbauen, wenn ein Service-Account hinterlegt ist.
// Fail-open-Muster für alle Aufrufer: ohne FIREBASE_SERVICE_ACCOUNT_KEY
// bleiben App Check/Rate-Limiting/Kontingente aus, statt den jeweiligen
// Endpoint komplett zu blockieren (siehe README "Bekannte Einschränkungen").
// Der Modul-Cache ist pro Serverless-Function-Bundle wirksam, nicht global —
// Vercel bündelt jede api/*.js-Datei (inkl. dieser Imports) als eigene,
// isolierte Function, daher kein Unterschied zum bisherigen Verhalten mit
// je einer eigenen Kopie pro Datei.
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
