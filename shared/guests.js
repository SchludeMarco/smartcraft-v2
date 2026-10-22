// Doc-Id eines Gasts in artifacts/{appId}/guests/{id}: die kleingeschriebene
// Google-Adresse. Gemeinsam für Client (src/guests.js, Admin-Bereich) und
// Server (api/_lib/guests.js), damit beide Seiten exakt dieselbe Id bilden —
// firestore.rules nutzt dafür request.auth.token.email.lower().
export const guestDocId = (email) => String(email || '').trim().toLowerCase();

export const isValidGuestEmail = (email) => /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email) && email.length <= 200;
