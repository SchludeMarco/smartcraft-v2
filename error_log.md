# Fehler-Log

Kuratierte, lesbare Übersicht aller über den Admin-Bereich (`AdminPanel.jsx`,
Zugriff seit V1.26.0 per Firebase Custom Claim statt PIN) gemeldeten Fehler.
Rohdaten liegen dauerhaft in Firestore
(`errorReports`-Collection-Group, siehe `errorReporting.js`) — diese Datei
fasst sie zusammen, damit man nicht bei jedem Blick ins Admin-Terminal alte,
längst behobene Reports erneut durchgehen muss.

**Erzeugt/aktualisiert:** manuell nach Abruf per `scripts/fetch-error-reports.mjs`
(liest read-only per anonymer Anmeldung aus Firestore, siehe Skript-Kopf).
Aufruf: `node --env-file=.env scripts/fetch-error-reports.mjs`

**Status-Werte:** `Offen` (Ursache/Fix noch ausständig) · `Beobachten` (Fix
vermutet ausreichend, noch nicht durch neue Reports bestätigt) · `Gelöst`
(Ursache behoben, mit Verweis auf Commit/CHANGELOG-Eintrag).

Stand: 2026-08-13 — Fehlersammlung in Firestore vollständig geleert (17 alte
Reports über 3 Nutzer-Pfade, größtenteils Monate/Versionsstände zurückliegend,
per `firebase firestore:delete -r`). Admin-Bereich sammelt ab jetzt nur noch
neue Reports; zusätzlich blendet ein neuer Filter ("Alte ausblenden") Reports
älter als 14 Tage standardmäßig aus (`src/AdminPanel.jsx`).

Die zuvor unten dokumentierten Fehlerbilder (`gemini-vision-api`,
`gemini-video-search-api`) waren zum Löschzeitpunkt **nicht** als behoben
bestätigt — die Rohdaten wurden nur aus Aufräumgründen entfernt, nicht weil
die Ursache behoben wurde. Falls diese Fehlerbilder erneut auftauchen, hier
neu als offener Eintrag dokumentieren.

---

## Offene Fehler

### 8. App Check: "AppCheck: Requests throttled due to previous 403 error" — blockiert alle `/api/gemini`-Aufrufe

- **Status:** Beobachten (Config nachweislich korrekt, echte Bestätigung durch
  reale Nutzer-Reports steht noch aus)
- **Kontext:** Erstmals bei SmartCraft-V2 (eigenständige Kopie, eigenes
  Vercel-Projekt `smartcraft-v2`, siehe `CLAUDE.md`/Versionshistorie ab
  V2.0.0) beobachtet, betrifft strukturell jeden der sechs
  `/api/gemini`-Aufrufer (App Check läuft vor `api/gemini.js`, sobald
  `FIREBASE_SERVICE_ACCOUNT_KEY` gesetzt ist).
- **Nachricht:** `FirebaseError: AppCheck: Requests throttled due to previous
  403 error. Attempts allowed again after 01d:00m:00s (appCheck/throttled)`
  (24.8.2026, 07:37:58 Uhr, V2.2.1, Android/Chrome Mobile, über den
  Admin-Bereich gemeldet). Live auf `smartcraft-v2.vercel.app`
  nachgestellt: `POST .../exchangeRecaptchaV3Token` → 403
  `PERMISSION_DENIED` "App attestation failed."
- **Ursache (nach Untersuchung wahrscheinlich kein Config-Fehler):**
  Site-Key/Secret-Key-Zuordnung (google.com/recaptcha/admin ↔ Firebase
  Console → App Check → Apps → reCAPTCHA-Provider) sowie Domain-Freigabe
  wurden mehrfach geprüft und korrigiert. Ein direkter Test gegen Googles
  `siteverify`-Endpoint mit einem frisch abgefangenen Token ergab
  `"timeout-or-duplicate"` — das Token war zu diesem Zeitpunkt bereits
  von Firebase selbst erfolgreich verifiziert worden, was Secret Key und
  Domain als korrekt bestätigt. Die wiederholten 403-Fehler beim
  Nachstellen kamen mit hoher Wahrscheinlichkeit daher, dass alle
  Nachstell-Versuche über einen **headless Chromium-Browser** (Playwright)
  liefen — reCAPTCHA v3 erkennt das zuverlässig als botartig und vergibt
  einen niedrigen Score, den Firebase App Check korrekterweise ablehnt.
  D.h. der 403 beim automatisierten Testen ist erwartetes Verhalten, keine
  Bestätigung eines echten Configfehlers.
- **Nächster Schritt:** Kein weiterer Config-Eingriff geplant. Falls dieses
  Fehlerbild bei einem eindeutig echten Nutzer-Gerät (nicht
  `HeadlessChrome` im User-Agent, siehe Report-Kontext) erneut auftaucht,
  hier neu untersuchen.

### 5. Alle `/api/gemini`-Aufrufer: "You exceeded your current quota... free_tier_requests, limit: 20"

- **Status:** Offen (das eigentliche Kontingent-Problem bleibt bestehen — nur
  die Symptomanzeige wurde in V1.27.4 behoben, siehe Eintrag 7 unten)
- **Kontext:** Ursprünglich bei `gemini-tts-summary-api`
  (`callGeminiTtsSummaryAPI` in `src/App.jsx`, ruft `/api/gemini` → Google
  Generative Language API auf) beobachtet. Am 16.8.2026 (V1.27.3) auch bei
  `gemini-vision-api` (Hauptanalyse) reproduziert — bestätigt damit das
  strukturell gleiche Risiko für jeden der sechs `/api/gemini`-Aufrufer
  (Hauptanalyse, TTS-Kurzfassung, Materialien, Sicherheit, Kundenbericht,
  Video-Suche), da alle denselben `GEMINI_API_KEY` teilen.
- **Nachricht:** "You exceeded your current quota... Quota exceeded for
  metric: generativelanguage.googleapis.com/generate_content_free_tier_requests,
  limit: 20" — zuletzt 16.8.2026 bei der Hauptanalyse (V1.27.3), zuvor
  15.8.2026, 17:30 Uhr, V1.26.6 bei der TTS-Kurzfassung (Android/Chrome
  Mobile). Dank Fix Nr. 4 (`extractApiErrorMessage`) zeigt der Report den
  echten Google-Fehlertext statt "[object Object]".
- **Vermutliche Ursache:** Der in `GEMINI_API_KEY` hinterlegte Schlüssel hängt
  an einem Google-Cloud-Projekt **ohne aktiviertes Billing** und läuft damit
  im kostenlosen Free-Tier von `generativelanguage.googleapis.com`. Dessen
  Kontingent für das aktuell hinter dem Alias `gemini-flash-latest`
  (`api/gemini.js`, `MODEL_NAME`) liegende Modell ist mit 20 Requests sehr
  klein — und gilt projektweit über ALLE Nutzer der App gemeinsam, nicht pro
  Besucher. Der eigene IP-Rate-Limiter in `api/gemini.js`
  (12/Minute, 200/Tag, siehe `RATE_LIMIT_MAX_PER_WINDOW`/`_DAY`) ist auf diesen
  Fall wirkungslos: Er bremst nur einzelne IPs, kann aber das global geteilte
  20er-Kontingent bei mehreren gleichzeitigen Nutzern nicht schützen.
- **Lösungsansatz (nicht code-seitig behebbar):** Billing für das
  Google-Cloud-Projekt hinter `GEMINI_API_KEY` in der Google AI Studio /
  Cloud Console aktivieren — das hebt die Anfrage auf den Pay-as-you-go-Tier
  mit deutlich höheren Limits. Bis dahin bleibt das Fehlerbild bei mehreren
  gleichzeitigen Nutzern reproduzierbar.

---

## Gelöste Fehler

### 10. gemini-trade-tool-api: "FUNCTION_INVOCATION_TIMEOUT" beim Berufs-Spezial-Tool ohne Kontext

- **Status:** Gelöst (V2.2.3)
- **Kontext:** `callGeminiTradeToolAPI` (`src/App.jsx`), betraf strukturell
  jeden `/api/gemini`-Aufrufer, nicht nur das erstbeobachtete Zimmerer-Tool
  "Holzart-Empfehlung".
- **Nachricht:** "An error occurred with your deployment
  FUNCTION_INVOCATION_TIMEOUT ..." — zweimal beim selben Tool innerhalb von
  15 Minuten (24.8.2026, 08:41 und 08:56 Uhr, V2.2.1/V2.2.2, Android/Chrome
  Mobile, über den Admin-Bereich gemeldet).
- **Ursache:** Direkt gegen die Gemini-API getestet (siehe unten) statt nur
  über die App: Das bisher verwendete `gemini-flash-latest` (`api/gemini.js`,
  `MODEL_NAME`) hing zum Testzeitpunkt komplett — mehrfach 0 Bytes nach
  40-60s, selbst bei einem trivialen "Sag nur Hallo"-Prompt, unabhängig vom
  konkreten Tool/Prompt. Das von Google für neue Nutzer empfohlene
  Nachfolgemodell `gemini-3.6-flash` antwortete zwar, aber als
  "Thinking"-Modell mit ca. 24s allein für "Hallo" — zu knapp für die 30s
  `maxDuration` der Vercel-Funktion, sobald App-Check-Verifikation +
  Firestore-Rate-Limit-Transaktion davor noch Zeit verbrauchen. Der
  "-latest"-Alias hatte sich also durch eine Google-seitige Modellrotation
  (vom 2.5- auf den 3.x-Modelljahrgang) faktisch selbst kaputtgemacht.
- **Lösung:** `MODEL_NAME` auf `gemini-flash-lite-latest` umgestellt — im
  selben direkten Test durchgehend 0-3s Antwortzeit (auch mit dem echten
  Holzart-Prompt), keine Thinking-Phase, weiterhin über den "-latest"-Alias
  automatisch update-sicher. Siehe CHANGELOG `[2.2.3]`.

### 9. Google-Login: "Firebase: Error (auth/unauthorized-domain)"

- **Status:** Gelöst (Config, kein Versions-Bump — betrifft keine Code-Datei)
- **Kontext:** `handleGoogleSignIn` in `src/App.jsx`, seit V2.2.0 auf jedem
  Login-Versuch relevant (Google-Login ist seitdem verpflichtend).
- **Nachricht:** `FirebaseError: Firebase: Error (auth/unauthorized-domain)`
  (24.8.2026, 08:28:17 Uhr, V2.2.1, Android/Chrome Mobile, über den
  Admin-Bereich gemeldet). Live auf `smartcraft-v2.vercel.app` per
  Network-Trace nachgestellt und bestätigt.
- **Ursache:** `smartcraft-v2.vercel.app` fehlte in Firebase Authentication →
  Settings → Authorized domains — jede neue Vercel-Domain muss dort einzeln
  freigeschaltet werden, unabhängig von der (separaten) Domain-Freigabe für
  reCAPTCHA/App Check (siehe Eintrag 8).
- **Lösung:** Domain am 24.8.2026 in Authorized domains ergänzt.

- **Status:** Gelöst (V1.27.4)
- **Kontext:** Hauptanalyse (`gemini-vision-api`), Materialien, Sicherheit,
  Kundenbericht und Video-Suche in `src/App.jsx`. Nur der TTS-Kurzfassungs-
  Aufrufer (`gemini-tts-summary-api`) zeigte bereits vorher eine feste,
  deutsche Nutzermeldung ohne `e.message`.
- **Nachricht:** Direkter Nutzerbeobachtung, ausgelöst durch Eintrag 5
  (Quota-Fehler): "Analysefehler / Fehler bei der Verbindung zur Analyse: You
  exceeded your current quota, please check your plan and billing
  details..." — der komplette, englische Google-API-Fehlertext (inkl.
  Verweis auf Google-eigene Rate-Limit-Dokulinks) landete unverändert in der
  für Endnutzer sichtbaren Fehlermeldung.
- **Ursache:** Die fünf Catch-Blöcke hängten `e.message` direkt an einen
  deutschen Präfix an (z.B. `"Fehler bei der Verbindung zur Analyse: " +
  e.message`). `e.message` stammt bei Server-/Upstream-Fehlern aus
  `extractApiErrorMessage()` und enthält damit im Zweifel den rohen,
  englischen Google-Fehlertext (Quota, Safety-Block, ungültige Anfrage) statt
  einer für Endnutzer verständlichen Meldung — irreführend, da z.B. "check
  your plan and billing details" beim App-Nutzer keinen Sinn ergibt (das
  betrifft nur das Google-Cloud-Projekt des Betreibers, siehe Eintrag 5).
- **Lösung:** Alle fünf Meldungen auf feste, deutsche Texte ohne `e.message`
  umgestellt (Vorbild: der bereits korrekte TTS-Kurzfassungs-Aufrufer). Der
  volle Originalfehler geht dabei nicht verloren — `queueErrorReport()`
  speichert `e.message` weiterhin unverändert für den Admin-Bereich, nur die
  für den Endnutzer sichtbare `setError()`-Meldung wurde vereinheitlicht.
  Behebt nicht die zugrunde liegende Quota-Ursache (Eintrag 5 bleibt offen).

### 6. Alle `/api/gemini`-Aufrufer: "Fehler bei der Verbindung zur Analyse: ... currently experiencing high demand"

- **Status:** Gelöst (V1.27.3)
- **Kontext:** Betrifft strukturell alle sechs `/api/gemini`-Aufrufer (u.a.
  `callGeminiVisionAPI`), die den geteilten `fetchWithRetry`-Helper in
  `src/App.jsx` nutzen.
- **Nachricht:** "Fehler bei der Verbindung zur Analyse: ... This model is
  currently experiencing high demand. Spikes in demand are usually
  temporary. Please try again later." (16.8.2026, vom Nutzer direkt
  beobachtet, nicht über den Admin-Bereich gemeldet).
- **Ursache:** `fetchWithRetry` wiederholte 5xx-Antworten (Google gibt bei
  Modell-Überlastung ein 5xx zurück) bisher nur 3× mit Backoff bis max. 4s
  — Gesamtwartezeit vor dem letzten Versuch nur ~3s. Ein manueller erneuter
  Klick kurz danach funktionierte zuverlässig, da sich die Überlastspitze
  bei Google in der Zwischenzeit meist schon gelegt hatte.
- **Lösung:** `maxRetries` in `fetchWithRetry` auf 5 erhöht, Backoff auf 8s
  gedeckelt (Gesamtwartezeit vor letztem Versuch jetzt ~15s), siehe
  CHANGELOG `[1.27.3]`.

### 1. gemini-tts-summary-api: "API error: " (leer)

- **Status:** Gelöst (V1.24.1)
- **Kontext:** `gemini-tts-summary-api` (`callGeminiTtsSummaryAPI` in
  `src/App.jsx`, nutzt den geteilten `fetchWithRetry`-Helper)
- **Nachricht:** "API error: " ohne jeden weiteren Text (14.8.2026, 22:29 Uhr,
  V1.24.0).
- **Ursache:** `fetchWithRetry` baute die Fehlermeldung bei 429/5xx-Antworten
  nach Ausschöpfen der Retries ausschließlich aus `response.statusText`
  (`src/App.jsx`, Zeile 166). Bei HTTP/2-Antworten — so liefert Vercel
  `/api/gemini` aus — ist `statusText` laut Fetch-Spec immer ein leerer
  String, wodurch die Meldung auf "API error: " ohne Inhalt kollabierte.
  Gleiche Fehlerklasse wie bereits einmal in `callGeminiVisionAPI` (V1.22.2,
  siehe Eintrag 2 unten), diesmal aber im geteilten Retry-Helper statt im
  einzelnen Aufrufer.
- **Lösung:** Meldung ergänzt `response.status` (immer vorhanden) neben dem
  ggf. leeren `statusText`, siehe CHANGELOG `[1.24.1]`.
- **Nachtrag (V1.24.2):** Nutzerbeobachtung — ein erneuter manueller Klick auf
  "Vorlesen" funktioniert direkt danach oft ohne ersichtlichen Grund. Ursache:
  `fetchWithRetry` wiederholte 429-Antworten automatisch (bis zu 3× mit
  Backoff), lag damit aber garantiert noch im selben 60s-Rate-Limit-Fenster
  des Servers (`api/gemini.js`) und scheiterte deshalb immer erneut — der
  spätere manuelle Klick traf dagegen oft schon auf ein zurückgesetztes
  Fenster. 429 wird jetzt nicht mehr automatisch wiederholt, siehe CHANGELOG
  `[1.24.2]`.

### 2. gemini-vision-api: "Fehler bei der KI-Anfrage oder leere Antwort." / FUNCTION_PAYLOAD_TOO_LARGE

- **Status:** Gelöst (V1.22.4)
- **Kontext:** `gemini-vision-api` (Hauptanalyse, `callGeminiVisionAPI` in
  `src/App.jsx`)
- **Nachricht:** Ursprünglich generisch "Fehler bei der KI-Anfrage oder leere
  Antwort." (3× zwischen 13.8.2026 15:58–16:07 Uhr, V1.22.0/1.22.1, sowie 4×
  zwischen V1.8.2–V1.10.0, siehe CHANGELOG `[1.14.1]`). Nach dem Error-
  Passthrough-Fix in V1.22.2 zeigte der nächste Report (13.8.2026, 16:17 Uhr,
  V1.22.3) den echten Fehler: `Request Entity Too Large` /
  `FUNCTION_PAYLOAD_TOO_LARGE`.
- **Ursache:** Vercel Serverless Functions haben ein hartes, nicht
  konfigurierbares Payload-Limit von 4,5MB. Bilder wurden unkomprimiert per
  `fileToBase64()` als Base64 an `/api/gemini` geschickt — ein
  5-12MB-Handyfoto (üblich bei modernen Android-Kameras, siehe User-Agent in
  den Reports) wird durch die Base64-Kodierung (+33%) zuverlässig größer als
  das Limit.
- **Lösung:** `fileToBase64()` skaliert Bilder jetzt vor dem Senden per
  Canvas auf max. 1600px Kantenlänge herunter und kodiert sie als JPEG
  (Qualität 0,82) neu; siehe CHANGELOG `[1.22.4]`. Zusätzlich wurde die
  generische Fehlermeldung selbst in V1.22.2 durch die tatsächliche
  Server-Antwort ersetzt (CHANGELOG `[1.22.2]`) — dieser Fix war die
  Voraussetzung dafür, die Root Cause überhaupt aus einem Report ablesen zu
  können.

### 3. google-tts-api: "Forbidden: invalid App Check token"

- **Status:** Gelöst (V1.26.2)
- **Kontext:** `google-tts-api` (`fetchTtsAudio`/`speakText` in `src/App.jsx`,
  ruft `/api/tts` über den geteilten `fetchWithRetry`-Helper auf)
- **Nachricht:** `{"error":"Forbidden: invalid App Check token"}` (15.8.2026,
  13:26 Uhr, V1.26.0, Android/Chrome Mobile).
- **Ursache:** `fetchWithRetry` hängte den `X-Firebase-AppCheck`-Header nur an,
  wenn die Ziel-URL `apiUrl` (`/api/gemini`) oder `demoStatusUrl`
  (`/api/demo-status`) war — `apiTtsUrl` (`/api/tts`) fehlte in dieser
  Bedingung. `api/tts.js` verlangt den Header aber zwingend, sobald App Check
  serverseitig aktiv ist (`FIREBASE_SERVICE_ACCOUNT_KEY` gesetzt), und lehnt
  ohne ihn jede Anfrage mit 401 ab. Strukturell betroffen war damit jede
  TTS-Anfrage, nicht nur Einzelfälle.
- **Lösung:** `apiTtsUrl` in die Bedingung aufgenommen, siehe CHANGELOG
  `[1.26.2]`.

### 4. gemini-vision-api (und weitere KI-Tools): "[object Object]"

- **Status:** Gelöst (V1.26.3)
- **Kontext:** `gemini-vision-api` (`callGeminiVisionAPI` in `src/App.jsx`) —
  strukturell identischer Code auch in `callGeminiTtsSummaryAPI`,
  `callGeminiMaterialsAPI`, `callGeminiSafetyAPI`, `callGeminiClientReportAPI`,
  `callGeminiVideoSearch`.
- **Nachricht:** "[object Object]" (15.8.2026, 13:31 Uhr, V1.26.1,
  Android/Chrome Mobile).
- **Ursache:** `api/gemini.js` reicht Gemini-eigene Fehlerantworten unverändert
  durch (`upstream.text()` → `res.send(text)`). Googles API-Fehlerformat ist
  `{"error": {"code":…, "message":"…", "status":"…"}}` — das `error`-Feld ist
  dort ein OBJEKT, während eigene Server-Fehler in `api/gemini.js`
  `{"error": "Text"}` als String liefern. Der Client las `.error` bislang ohne
  diese Unterscheidung und reichte es direkt an `new Error(errorMsg)` weiter;
  bei einem Objekt stringifiziert JS das automatisch zu "[object Object]" —
  der eigentliche Gemini-Fehlertext (z.B. Safety-Block, ungültige Anfrage,
  Kontingent) ging dabei verloren. Betraf jeden der sechs `/api/gemini`-Aufrufe
  im Client gleichermaßen, nicht nur die Hauptanalyse.
- **Lösung:** Neuer gemeinsamer Helfer `extractApiErrorMessage()` in
  `src/App.jsx` unterscheidet String- und Objekt-Fehler (nutzt bei Objekten
  `.message`) und ersetzt die bisher sechsfach duplizierte Extraktion, siehe
  CHANGELOG `[1.26.3]`.

<!--
### N. Kurzbeschreibung

- **Status:** Gelöst (VX.Y.Z)
- **Kontext:** …
- **Nachricht:** …
- **Ursache:** …
- **Lösung:** … (Verweis auf CHANGELOG-Eintrag/Commit)
-->
