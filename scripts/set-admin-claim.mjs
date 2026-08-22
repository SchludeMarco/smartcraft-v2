// Einmaliges Admin-Skript: setzt/entfernt den Firebase Custom Claim "admin: true"
// für ein bestehendes Konto (per E-Mail). Läuft NIE im App-Code, nur manuell lokal
// mit dem Service-Account aus FIREBASE_SERVICE_ACCOUNT_KEY (gleiche Variable wie
// api/gemini.js). Damit lässt sich Admin-Status vergeben, ohne UID/E-Mail/PIN im
// Code oder Repo zu hinterlegen — siehe api/gemini.js (isAdminRequest),
// firestore.rules (errorReports/adminMeta) und src/AdminPanel.jsx.
//
// Nutzung:
//   node --env-file=.env scripts/set-admin-claim.mjs <email>            Claim setzen
//   node --env-file=.env scripts/set-admin-claim.mjs <email> --revoke   Claim entfernen
//
// Wichtig: Der Claim landet erst im ID-Token nach einem Token-Refresh — im Browser
// reicht ab-/wieder anmelden oder bis zu 1h warten (Firebase erneuert automatisch).
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [, , email, flag] = process.argv;
if (!email) {
  console.error('Nutzung: node --env-file=.env scripts/set-admin-claim.mjs <email> [--revoke]');
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY fehlt (siehe .env.example).');
  process.exit(1);
}

const app = initializeApp({ credential: cert(JSON.parse(raw)) });
const auth = getAuth(app);

const user = await auth.getUserByEmail(email);
const grant = flag !== '--revoke';
await auth.setCustomUserClaims(user.uid, grant ? { admin: true } : {});

console.log(
  grant
    ? `Admin-Claim gesetzt für ${email} (uid: ${user.uid}). Im Client wirksam nach Token-Refresh (ab-/wieder anmelden).`
    : `Admin-Claim entfernt für ${email} (uid: ${user.uid}).`
);
process.exit(0);
