import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { FREE_TRIAL_MAX } from '../shared/trialLimit.js';
import { getAdminApp, verifyAppCheck } from './_lib/firebaseAdmin.js';
import { isSameOrigin } from './_lib/sameOrigin.js';

// Rein lesender Zwilling zu api/gemini.js: liest den aktuellen Stand des
// Pro-Konto-Kontingents (_analysisQuota/{uid}.count), ohne ihn zu erhöhen.
// Wird beim App-Start (nach dem Login) aufgerufen, damit der Nutzer schon vor
// der ersten Analyse sieht, wie viele kostenlose Analysen noch übrig sind —
// analog zu api/demo-status.js, aber pro Konto (uid aus dem ID-Token) statt
// pro IP, siehe api/gemini.js für die Begründung.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Nur Requests vom eigenen Frontend akzeptieren, gleiches Muster wie
  // api/demo-status.js (inkl. Referer-Fallback für GET ohne Origin-Header).
  if (!isSameOrigin(req, { allowRefererFallback: true })) {
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
