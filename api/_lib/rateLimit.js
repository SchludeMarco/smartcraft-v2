import { getFirestore } from 'firebase-admin/firestore';

// Generischer Fixed-Window-Zähler (Minute + Tag) pro Firestore-Dokument,
// atomar per Transaktion aktualisiert — das gemeinsame Grundmuster hinter
// den einfachen IP-Rate-Limits mehrerer /api/*-Endpoints (report-bug,
// send-feedback, app-start, TTS). Jeder Aufrufer übergibt eine eigene
// Collection/docId (damit sich die Endpoints nicht gegenseitig das
// Kontingent wegnehmen) sowie eigene Limits passend zur jeweiligen
// Missbrauchsgefahr.
//
// api/gemini.js hat ein eigenes, komplexeres checkRateLimit (zusätzliches
// Lebenszeit-Demo-Kontingent für Requests ohne ID-Token) und bleibt bewusst
// unverändert statt hier eingebunden zu werden.
export async function checkFixedWindowRateLimit(
  app,
  collection,
  docId,
  { maxPerWindow, maxPerDay, windowMs = 60_000, dayMs = 24 * 60 * 60 * 1000 }
) {
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
