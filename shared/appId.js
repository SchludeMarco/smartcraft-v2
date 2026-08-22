// Single Source of Truth für die Firestore-App-ID (Pfadpräfix
// `artifacts/{appId}/...`). Importiert von src/App.jsx (Client) und
// api/report-bug.js (Server, Bug-Mail-Dedup) — muss auf beiden Seiten
// identisch sein, sonst greifen sie auf unterschiedliche Firestore-Pfade zu.
export const APP_ID = 'smartcraft-baustellenanalyse';
