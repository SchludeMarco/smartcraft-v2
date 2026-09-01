import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_LIFETIME_MAX } from '../shared/demoLimit.js';
import { getAdminApp, verifyAppCheck } from './_lib/firebaseAdmin.js';
import { isSameOrigin } from './_lib/sameOrigin.js';

// Rein lesender Zwilling zu api/gemini.js: liest den aktuellen Stand des
// Demo-Kontingents (_rateLimits/{ip}.lifetimeCount), ohne ihn zu erhöhen.
// Wird beim App-Start aufgerufen, damit der Nutzer schon vor der ersten
// Analyse sieht, wie viele KI-Anfragen noch übrig sind — verbraucht selbst
// aber keine davon.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Nur Requests vom eigenen Frontend akzeptieren, gleiches Muster wie
  // api/gemini.js — verhindert, dass fremde Seiten hier IP-Stände abfragen.
  // Unterschied zu api/gemini.js: einfache GET-Requests ohne Body/Custom-
  // Header schicken je nach Browser keinen Origin-Header (anders als die
  // POST-Requests an /api/gemini, die zuverlässig einen Origin-Header
  // mitschicken) — deshalb zusätzlich Referer als Fallback prüfen, bevor
  // legitime Anfragen fälschlich mit 403 abgewiesen werden.
  if (!isSameOrigin(req, { allowRefererFallback: true })) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const app = getAdminApp();
  if (!app) {
    res.status(200).json({ max: DEMO_LIFETIME_MAX, remaining: null });
    return;
  }

  const appCheckOk = await verifyAppCheck(req, app);
  if (!appCheckOk) {
    res.status(401).json({ error: 'Forbidden: invalid App Check token' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const snap = await getFirestore(app).collection('_rateLimits').doc(ip).get();
  const lifetimeCount = snap.exists ? (snap.data().lifetimeCount || 0) : 0;
  const remaining = Math.max(0, DEMO_LIFETIME_MAX - lifetimeCount);
  res.status(200).json({ max: DEMO_LIFETIME_MAX, remaining });
}
