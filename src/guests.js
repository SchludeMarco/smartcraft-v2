import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { guestDocId } from '../shared/guests.js';

// Gästeliste "Nur für Eingeladene" (artifacts/{appId}/guests/{email}, siehe
// api/_lib/guests.js für die serverseitige Prüfung und firestore.rules für
// die Zugriffsregeln).

// Letztes positives Ergebnis pro Konto, damit die App auf der Baustelle ohne
// Empfang (Firestore offline, kein Cache-Treffer) nicht vor der Tür steht.
// Rein komfortabel: jede KI-Anfrage prüft der Server ohnehin erneut.
const cacheKey = (uid) => `smartcraft.guest.${uid}`;
const readCache = (uid) => {
  try {
    return localStorage.getItem(cacheKey(uid)) === '1';
  } catch {
    return false;
  }
};
const writeCache = (uid, invited) => {
  try {
    if (invited) localStorage.setItem(cacheKey(uid), '1');
    else localStorage.removeItem(cacheKey(uid));
  } catch {
    // Privater Modus o.ä.: dann eben ohne Offline-Merker.
  }
};

/**
 * 'granted' | 'denied' | 'error' für das angemeldete Konto. Admins (Custom
 * Claim) sind immer eingeladen; alle anderen brauchen ihr Gast-Dokument.
 */
export async function checkGuestAccess(db, appId, user, isAdmin) {
  if (isAdmin) return 'granted';
  const id = guestDocId(user?.email || user?.providerData?.find((p) => p.providerId === 'google.com')?.email);
  if (!db || !id) return 'denied';
  try {
    const snap = await getDoc(doc(db, 'artifacts', appId, 'guests', id));
    writeCache(user.uid, snap.exists());
    return snap.exists() ? 'granted' : 'denied';
  } catch (e) {
    if (e?.code === 'permission-denied') return 'denied';
    return readCache(user.uid) ? 'granted' : 'error';
  }
}

export async function fetchGuests(db, appId) {
  const snapshot = await getDocs(collection(db, 'artifacts', appId, 'guests'));
  return snapshot.docs
    .map((d) => ({ email: d.id, invitedAt: d.data().invitedAt?.toMillis?.() || null }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export const addGuest = (db, appId, email) =>
  setDoc(doc(db, 'artifacts', appId, 'guests', guestDocId(email)), { invitedAt: serverTimestamp() });

export const removeGuest = (db, appId, email) => deleteDoc(doc(db, 'artifacts', appId, 'guests', guestDocId(email)));
