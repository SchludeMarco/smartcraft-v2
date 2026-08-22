// Einmaliges Hilfsskript: liest alle Fehlerreports aus der Firestore
// `errorReports`-Collection-Group aus (gleicher Weg wie src/AdminPanel.jsx /
// src/errorReporting.js: anonyme Anmeldung + collectionGroup-Query, rein
// lesend) und gibt sie als JSON auf stdout aus. Dient als Basis für
// error_log.md. Kein fester Bestandteil des Build-/App-Codes.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collectionGroup, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

await signInAnonymously(auth);

const snapshot = await getDocs(collectionGroup(db, 'errorReports'));
const reports = [];
snapshot.forEach((docSnap) => {
  reports.push({ id: docSnap.id, path: docSnap.ref.path, ...docSnap.data() });
});
reports.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

console.log(JSON.stringify(reports, null, 2));
process.exit(0);
