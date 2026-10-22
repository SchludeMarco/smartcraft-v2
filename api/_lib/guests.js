import { getFirestore } from 'firebase-admin/firestore';
import { APP_ID } from '../../shared/appId.js';
import { guestDocId } from '../../shared/guests.js';

// "Nur für Eingeladene" (analog zu RetroMind): Sm@rtCraft ist kein öffentliches
// Angebot, sondern nur für Personen, die der Admin eingeladen hat. Die
// Gästeliste liegt in Firestore unter artifacts/{appId}/guests/{email}
// (gepflegt im Admin-Bereich, siehe src/GuestList.jsx), Konten mit Custom
// Claim "admin: true" (scripts/set-admin-claim.mjs) gelten immer als
// eingeladen. Durchgesetzt wird das hier serverseitig für jeden kosten-
// verursachenden Endpoint (Gemini, TTS, Geocoding) und zusätzlich in
// firestore.rules für die Nutzerdaten — das Login-Gate in App.jsx ist nur die
// passende Anzeige dazu, kein Schutz.

// Pro Function-Instanz kurz gecacht, damit nicht jede einzelne KI-Anfrage einen
// Firestore-Read kostet. Ein Entfernen von der Gästeliste greift dadurch
// spätestens nach CACHE_TTL_MS.
const CACHE_TTL_MS = 60_000;
const cache = new Map();

// decoded = verifiziertes Firebase-ID-Token (getAuth(app).verifyIdToken bzw.
// verifyFirebaseIdToken in api/tts.js). Nur eine von Google bestätigte
// E-Mail-Adresse zählt, nie eine vom Client behauptete.
export async function isInvited(app, decoded) {
  if (!decoded) return false;
  if (decoded.admin === true) return true;
  if (decoded.email_verified !== true) return false;
  const id = guestDocId(decoded.email);
  if (!id) return false;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.invited;
  const snap = await getFirestore(app).collection('artifacts').doc(APP_ID).collection('guests').doc(id).get();
  cache.set(id, { invited: snap.exists, at: Date.now() });
  return snap.exists;
}

// Einheitliche Antwort für nicht eingeladene Konten — "code" erlaubt dem
// Client, sie von anderen 403ern zu unterscheiden.
export function denyNotInvited(res) {
  res.status(403).json({
    error: 'Kein Zugang: Dieses Google-Konto ist nicht eingeladen. Sm@rtCraft ist nur für eingeladene Gäste.',
    code: 'not_invited',
  });
}
