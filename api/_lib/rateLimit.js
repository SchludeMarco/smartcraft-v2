import { getFirestore } from 'firebase-admin/firestore';

// Fixed-Window-Zähler pro Doc (z.B. IP), atomar per Firestore-Transaktion
// aktualisiert. Gemeinsamer Kern für die simplen Zwei-Fenster-Limiter
// (Minute + Tag) in app-start.js, report-bug.js, send-feedback.js und
// tts.js — jeweils mit eigener Collection/Doc-Id und eigenen Limits, damit
// sich die Endpoints nicht gegenseitig das Kontingent wegnehmen.
//
// api/gemini.js hat einen eigenen, komplexeren Zähler (zusätzliches
// Lebenszeit-Demo-Kontingent) und bleibt bewusst davon getrennt.
export async function checkFixedWindowRateLimit(app, { collection, docId, windowMs, maxPerWindow, dayMs, maxPerDay }) {
  const db = getFirestore(app);
  const ref = db.collection(collection).doc(docId);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    let { minuteStart = 0, minuteCount = 0, dayStart = 0, dayCount = 0 } = data;
    if (now - minuteStart > windowMs) {
      minuteStart = now;
      minuteCount = 0;
    }
    if (now - dayStart > dayMs) {
      dayStart = now;
      dayCount = 0;
    }
    minuteCount += 1;
    dayCount += 1;
    const allowed = minuteCount <= maxPerWindow && dayCount <= maxPerDay;
    tx.set(ref, { minuteStart, minuteCount, dayStart, dayCount }, { merge: true });
    return allowed;
  });
}
