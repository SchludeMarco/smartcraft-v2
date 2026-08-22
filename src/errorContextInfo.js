/**
 * Bekannte Fehlerkontexte (siehe queueErrorReport-Aufrufe in App.jsx/ErrorBoundary.jsx) mit
 * kurzer Ursachen-/Lösungshilfe für den Admin-Bereich. Bewusst statisch statt per KI generiert,
 * da die Ursachen für diese Kontexte bekannt und stabil sind.
 *
 * Bewusst ohne Firebase-Import in einer eigenen Datei: wird sowohl vom Client
 * (errorReporting.js) als auch von der Node-Serverless-Function
 * (api/report-bug.js) importiert — Letztere soll nicht den kompletten
 * Firebase-Client-SDK-Baum mitbündeln müssen.
 */
export const ERROR_CONTEXT_INFO = {
  'firebase-init': {
    label: 'Firebase-Initialisierung fehlgeschlagen',
    cause: 'Firebase-Konfiguration (VITE_FIREBASE_*) fehlt/ungültig, oder das Firebase-Projekt ist nicht erreichbar.',
    fix: 'Env-Variablen in .env bzw. Vercel-Projekteinstellungen prüfen; Firebase-Projektstatus in der Console kontrollieren.',
  },
  'firebase-signout': {
    label: 'Abmelden fehlgeschlagen',
    cause: 'Netzwerkproblem beim Firebase-Sign-out.',
    fix: 'Nachricht/Stacktrace unten prüfen; Firebase-Projektstatus in der Console kontrollieren.',
  },
  'app-check-token': {
    label: 'App-Check-Token konnte nicht geholt werden',
    cause: 'reCAPTCHA v3 lieferte keinen gültigen Token — z.B. weil die aufgerufene Domain nicht bei reCAPTCHA hinterlegt ist, VITE_RECAPTCHA_SITE_KEY nicht zum in Firebase App Check registrierten Key passt, oder die Web-App dort noch nicht (mit diesem Key) registriert ist. Jede nachfolgende /api/gemini-Anfrage scheitert dadurch mit 401.',
    fix: 'Fehlermeldung/Stacktrace unten prüfen (enthält meist einen Firebase-Fehlercode wie appCheck/…); Domain in der reCAPTCHA-Site-Konfiguration (google.com/recaptcha/admin) mit der tatsächlichen Vercel-Domain abgleichen und mit VITE_RECAPTCHA_SITE_KEY in Vercel vergleichen.',
  },
  'gemini-vision-api': {
    label: 'Bildanalyse (Haupt-KI-Aufruf) fehlgeschlagen',
    cause: '/api/gemini nicht erreichbar, Gemini-API-Fehler/Timeout, oder Antwort nicht im erwarteten Format.',
    fix: 'Vercel-Logs für /api/gemini prüfen, Gültigkeit/Kontingent von GEMINI_API_KEY kontrollieren.',
  },
  'gemini-materials-api': {
    label: 'Materialliste-Generierung fehlgeschlagen',
    cause: 'Gemini konnte keine valide JSON-Materialliste liefern, oder die API-Anfrage schlug fehl.',
    fix: 'Antworttext in der Browser-Konsole prüfen; ggf. Prompt/Schema in SYSTEM_INSTRUCTION_MATERIAL justieren.',
  },
  'gemini-safety-api': {
    label: 'Sicherheits-Check-Generierung fehlgeschlagen',
    cause: 'Gemini-API-Fehler/Timeout beim Erzeugen des Sicherheits-Checks.',
    fix: 'Vercel-Logs für /api/gemini prüfen; bei wiederholtem Auftreten Prompt-Länge/Kontingent kontrollieren.',
  },
  'gemini-client-report-api': {
    label: 'Kundenbericht-Generierung fehlgeschlagen',
    cause: 'Gemini-API-Fehler/Timeout beim Erzeugen des Kundenberichts.',
    fix: 'Vercel-Logs für /api/gemini prüfen; bei wiederholtem Auftreten Prompt-Länge/Kontingent kontrollieren.',
  },
  'gemini-video-search-api': {
    label: 'Video-Suche fehlgeschlagen',
    cause: 'Google-Search-Grounding lieferte keine verwertbare/parsbare Antwort, oder die API-Anfrage schlug fehl.',
    fix: 'Antworttext in der Browser-Konsole prüfen; Regex-Extraktion in callGeminiVideoSearch ggf. anpassen.',
  },
  'google-tts-api': {
    label: 'Premium-Sprachausgabe (Google Cloud TTS) fehlgeschlagen',
    cause: '/api/tts nicht erreichbar, eigenes Tageskontingent/Rate-Limit erschöpft (kein Bug), oder ein unerwarteter Fehler bei Google Cloud TTS selbst (z.B. Kontingent/Billing-Problem auf Google-Seite).',
    fix: 'Nachricht/Stacktrace unten prüfen. Bei Google-Cloud-seitigem Kontingentfehler: Billing für das Projekt hinter GOOGLE_TTS_API_KEY in der Cloud Console kontrollieren (analog zum bekannten Gemini-Quota-Fehlerbild, siehe error_log.md).',
  },
  'gemini-tts-summary-api': {
    label: 'KI-Kurzfassung für Sprachausgabe fehlgeschlagen',
    cause: '/api/gemini nicht erreichbar, Gemini-API-Fehler/Timeout, oder Antwort nicht im erwarteten Format beim Erzeugen der Vorlese-Kurzfassung.',
    fix: 'Vercel-Logs für /api/gemini prüfen, Gültigkeit/Kontingent von GEMINI_API_KEY kontrollieren.',
  },
  'app-check-init': {
    label: 'App-Check-Initialisierung fehlgeschlagen',
    cause: 'reCAPTCHA/App-Check-Setup (VITE_RECAPTCHA_SITE_KEY) konnte beim App-Start nicht initialisiert werden.',
    fix: 'VITE_RECAPTCHA_SITE_KEY in Vercel/.env prüfen; Domain-Freischaltung in der reCAPTCHA-Konsole kontrollieren.',
  },
  'load-history-api': {
    label: 'Analyse-Historie laden fehlgeschlagen',
    cause: 'Firestore-Abfrage der letzten Analysen schlug fehl — Netzwerkproblem oder fehlende Berechtigung (Firestore-Regeln).',
    fix: 'Nachricht unten prüfen; Firestore-Regeln für den Pfad artifacts/{appId}/users/{userId}/analyses kontrollieren.',
  },
  'image-load': {
    label: 'Bild laden/verarbeiten fehlgeschlagen',
    cause: 'fileToBase64() konnte die ausgewählte Bilddatei nicht lesen oder als Canvas/JPEG neu kodieren (z.B. beschädigte Datei, ungewöhnliches Format, Speicherlimit auf dem Gerät).',
    fix: 'Nachricht/Stacktrace unten prüfen; betroffenes Dateiformat/-gerät (User-Agent im Report) mit der Implementierung in fileToBase64() abgleichen.',
  },
  'browser-tts-unsupported': {
    label: 'Browser ohne Sprachausgabe-Unterstützung',
    cause: 'Der Browser des Nutzers unterstützt die Web Speech API nicht — betrifft den Fallback, wenn Premium-TTS aus irgendeinem Grund nicht verfügbar ist; einziger echter Dead-End ohne jede Audioausgabe.',
    fix: 'Betroffenen Browser/User-Agent im Report prüfen; ggf. Hinweistext für bekannte nicht unterstützte Browser ergänzen.',
  },
  'google-signin': {
    label: 'Google-Anmeldung fehlgeschlagen',
    cause: 'Google-Login abgebrochen/blockiert (Popup), Account-Linking-Konflikt (Google-Konto bereits mit anderem Nutzer verknüpft), oder Google-Provider ist in der Firebase Console nicht aktiviert.',
    fix: 'Firebase Console → Authentication → Sign-in method → prüfen, ob "Google" aktiviert ist; bei wiederholtem "credential-already-in-use" ist das erwartetes Verhalten (siehe handleGoogleSignIn in App.jsx).',
  },
  'react-error-boundary': {
    label: 'Unerwarteter React-Crash',
    cause: 'Ein Rendering-Fehler in der UI (z.B. unerwartete/fehlende Daten) hat die App zum Absturz gebracht.',
    fix: 'Stacktrace unten prüfen, betroffene Komponente identifizieren und Datenvalidierung ergänzen.',
  },
};

export const getErrorContextInfo = (context) =>
  ERROR_CONTEXT_INFO[context] || {
    label: context || 'Unbekannter Fehlerkontext',
    cause: 'Kein Eintrag für diesen Kontext hinterlegt.',
    fix: '—',
  };
