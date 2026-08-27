// Single Source of Truth fürs kostenlose Kontingent an Haupt-Diagnosen pro
// Konto (nicht pro IP/Gerät wie DEMO_LIFETIME_MAX, siehe demoLimit.js).
// Importiert von api/gemini.js, api/trial-status.js und src/App.jsx
// (Client-Banner), damit die angezeigte Zahl nie von der tatsächlich
// durchgesetzten Grenze abweicht. Ist das Kontingent aufgebraucht, muss ein
// eingeloggter Nutzer einen eigenen Gemini-API-Key im Profil hinterlegen
// (siehe UserProfileModal in App.jsx), um SmartCraft weiter zu nutzen.
export const FREE_TRIAL_MAX = 20;
