// Einziges Konto mit Zugang zum Admin-Bereich: Marcos Google-Konto. Gemeinsam
// für Client (src/App.jsx, nur für die Anzeige) und Server (api/gemini.js,
// api/_lib/guests.js) — firestore.rules (isAdmin()) prüft dieselbe Adresse,
// dort muss sie bei einer Änderung von Hand mitgezogen werden.
export const ADMIN_EMAIL = 'marco.schlude@gmail.com';

// Admin ist nur, wer ALLES erfüllt: Custom Claim "admin: true"
// (scripts/set-admin-claim.mjs), von Google bestätigte Adresse ADMIN_EMAIL und
// eine verknüpfte Google-Identität. Ein Claim auf einem anderen Konto reicht
// damit nicht mehr. claims = verifiziertes ID-Token (Server) bzw.
// getIdTokenResult().claims (Client).
export function isAdminClaims(claims) {
  if (!claims || claims.admin !== true) return false;
  if (claims.email_verified !== true) return false;
  if (String(claims.email || '').trim().toLowerCase() !== ADMIN_EMAIL) return false;
  return !!claims.firebase?.identities?.['google.com'];
}
