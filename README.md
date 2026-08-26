# Sm@rtCraft – Der Kollege in der Hosentasche (V2.9.7)

**Ein Werkzeug, das ich mir selbst gewünscht hätte.**

Bevor ich in die KI-Anwendungsentwicklung gewechselt bin, habe ich als Zimmermann
gearbeitet. Auf der Baustelle steht man ständig vor Problemen, bei denen die Lösung
nicht offensichtlich ist: ein Wasserschaden am Dachbalken, ein Riss im Mauerwerk, eine
Elektroinstallation, die nicht so recht ins vorhandene Konzept passt. Man ruft einen
Kollegen an, blättert im Fachbuch, oder fährt zum Baumarkt und hofft, dass der Verkäufer
weiterhelfen kann. Jede Baustelle ist im Grunde ihre eigene, teilweise völlig neue Welt
mit eigenen Regeln — und genau da stand früher oft nur ein Fragezeichen, wo eigentlich
eine klare Einschätzung gebraucht wurde.

Diesen Wunsch nach einem Kollegen, der immer dabei ist, hatte ich schon seit den
Anfängen des Smartphones. Erst die breite Verfügbarkeit leistungsfähiger KI-Modelle hat
ihn technisch realistisch gemacht. Sm@rtCraft ist der Versuch, genau diese Lücke zu
schließen: ein KI-gestützter Kollege in der Hosentasche, der ein Foto oder eine
Beschreibung des Problems sieht und in Sekunden eine fachlich fundierte Einschätzung
liefert.

Konzipiert ist Sm@rtCraft in erster Linie fürs Smartphone: Foto direkt mit der
Gerätekamera aufnehmen und noch vor Ort auswerten lassen, ohne Umweg über einen PC.
Da die App als reine Web-App im Browser läuft, funktioniert sie genauso gut am
Desktop — etwa im Büro zur Nachbereitung oder für den Kundenbericht.

Entstanden während der Schulung zum KI-Anwendungsspezialisten.

## Entstehung & technische Hürden

Der erste Prototyp war ein Google-AI-Studio-Canvas-Export — funktional, aber nicht
eigenständig lauffähig und mit dem API-Key sichtbar im Client-Code. Der erste echte
Schritt war die Migration zu einem eigenständigen Vite/React-Projekt mit einem
Vercel-Serverless-Proxy vor der Gemini API, damit der Key server-seitig bleibt.
Von dort an kamen die Hürden meist erst im Betrieb ans Licht, nicht am Reißbrett:

- **Der Gemini-Proxy war anfangs offen** — jede beliebige Seite hätte ihn
  ansprechen und echte API-Kosten verursachen können. Origin-Check, Firebase App
  Check (reCAPTCHA v3) und IP-basiertes Rate-Limiting kamen erst nachträglich
  dazu, nachdem klar wurde, dass das eigentliche Risiko nicht ein Absturz,
  sondern eine Kostenexplosion durch automatisierten Missbrauch ist.
- **Für den öffentlichen Demo-Link (z.B. LinkedIn) reichte das Rate-Limiting
  allein nicht** — 200 Anfragen/Tag sind pro IP dauerhaft nutzbar, nicht nur
  einmalig zum Ausprobieren. Ergänzend zählt derselbe Firestore-Zähler jetzt
  auch lebenslang pro IP mit (`lifetimeCount`) und blockt ab `DEMO_LIFETIME_MAX`
  (30, siehe `shared/demoLimit.js`) mit einer eigenen, nicht wiederholbaren
  403-Antwort statt des üblichen 429 — der Client versucht 429 automatisch
  erneut, ein aufgebrauchtes Demo-Kontingent soll aber sofort und mit
  Klartext-Meldung enden. Damit Erstbesucher das nicht erst beim Fehlschlagen
  erfahren, weist ein wegklickbarer Info-Banner schon beim ersten Öffnen der
  App auf das Limit hin — inklusive Live-Zähler ("Noch X von 30 übrig"), der
  beim Start über den rein lesenden Endpoint `api/demo-status.js` geladen und
  nach jeder KI-Anfrage über den `X-Demo-Remaining`-Header aus `api/gemini.js`
  aktualisiert wird. Denselben Live-Stand zeigt zusätzlich das Analyseergebnis
  selbst (direkt unter "Lösung und Diagnose"), damit er nach jeder
  Hauptanalyse neu ins Blickfeld rückt — unabhängig davon, ob der Banner oben
  weggeklickt wurde.
- **Zwei Gemini-Modelle wurden während der Entwicklung abgeschaltet**
  (`gemini-2.5-flash-preview-09-2025`, danach `gemini-2.5-flash`) — die App lief
  jeweils plötzlich ins Leere. Umgestellt auf `gemini-flash-latest` (ein
  stabiler Alias statt einer festen Versionsnummer), der auf das jeweils
  aktuelle Modell zeigt. **Der Alias selbst erwies sich am 24.8.2026 aber als
  Falle:** Nach einer Google-seitigen Modellrotation hing er komplett (0 Bytes
  nach 40-60s), das gepinnte Nachfolgemodell (`gemini-3.6-flash`) antwortete
  zwar, aber als "Thinking"-Modell mit ca. 24s allein für ein triviales
  "Hallo" — zu langsam für das 30s-Zeitbudget der Vercel-Funktion, sichtbar
  als `FUNCTION_INVOCATION_TIMEOUT` (siehe `error_log.md`). Umgestellt auf
  `gemini-flash-lite-latest`: gleiche Update-Sicherheit durch den
  "-latest"-Alias, aber ohne Thinking-Phase und in Tests durchgehend
  0-3s Antwortzeit bei weiterhin guter Qualität.
- **Firestore im Produktionsmodus** heißt: standardmäßig alles gesperrt. Ohne die
  Regeln aus [`firestore.rules`](./firestore.rules) einmal manuell in der Firebase
  Console zu veröffentlichen, schlug jeder Zugriff mit "Missing or insufficient
  permissions" fehl — ein Schritt, der sich nicht aus dem Code allein erschließt.
- **Die Sprachausgabe (TTS) brauchte drei komplette Anläufe.** Der erste Versuch
  (serverseitiger Gemini-TTS-Aufruf) scheiterte an einer fehlenden API-Berechtigung
  (Status 401) und wurde vollständig verworfen. Der zweite Ansatz lief rein
  clientseitig über die Web Speech API des Browsers — dabei mussten mehrere
  unabhängige Browser-Eigenheiten umschifft werden: ein Abbruch nach ca. 15
  Sekunden bei langen Einzel-Utterances, eine vorzeitige Garbage Collection des
  `SpeechSynthesisUtterance`-Objekts, die die Ansage ohne jede Fehlermeldung
  mitten im Satz stoppte, und die Erkenntnis, dass vom Browser gemeldete Stimmen
  (`getVoices()`) teils gar keinen Ton ausgeben — ein Versuch, für die
  Geschlechtsauswahl per Namens-Heuristik auf eine andere gemeldete Stimme
  umzuschalten, führte prompt zu stummer Wiedergabe, ein anschließender
  Tonhöhen-Kompromiss (statt echtem Stimmenwechsel) blieb unbefriedigend. Der
  dritte, heute aktive Ansatz verlässt sich gar nicht mehr auf browser- bzw.
  betriebssystemabhängige Stimmen, sondern läuft serverseitig über die Google
  Cloud Text-to-Speech API (`api/tts.js`, WaveNet-Stimmen) — echte, konsistente
  Qualität unabhängig davon, was auf dem Gerät des Nutzers installiert ist.
- **Google-Sign-In (Account-Linking auf eine bestehende anonyme Sitzung)** brachte
  eigene, erst in Produktion sichtbare Tücken mit: Firebase liefert `photoURL`
  nach dem Linking teils nur in `providerData` statt im User-Root-Objekt, und
  `onAuthStateChanged` gibt nach dem Linking manchmal dasselbe, in-place mutierte
  User-Objekt zurück — ein einfaches `setAuthUser(user)` löste dadurch per
  React-Referenzvergleich keinen Re-Render aus.
- **Fotos direkt von Smartphone-Kameras sprengten das Vercel-Payload-Limit.**
  Bilder wurden unkomprimiert als Base64 an `/api/gemini` geschickt; ein
  typisches 5-12MB-Handyfoto wird dadurch (+33% durch die Base64-Kodierung)
  zuverlässig größer als das harte, nicht konfigurierbare 4,5MB-Limit von
  Vercel Serverless Functions — sichtbar als `FUNCTION_PAYLOAD_TOO_LARGE`.
  Bilder werden jetzt vor dem Versand clientseitig per Canvas auf max. 1600px
  Kantenlänge herunterskaliert und als JPEG neu kodiert.

Die vollständige, chronologische Historie aller Versionen inklusive Problem →
Ursache → Lösung steht in [`CHANGELOG.md`](./CHANGELOG.md).

## Für wen ist Sm@rtCraft?

Die App kennt keinen Unterschied zwischen Berufsalltag und Privathaushalt — dieselbe
Diagnose-Engine hilft in beiden Situationen weiter:

- **Auf der Baustelle / im Berufsalltag** — als schnelle Zweitmeinung, wenn der
  passende Kollege gerade nicht erreichbar ist: ein untypischer Wasserfleck an der
  Decke, ein Riss, dessen Ursache unklar ist, eine Installation, die vom Standard
  abweicht. Beruf auswählen, Foto oder Beschreibung rein, fertig ist eine Einschätzung
  auf Fachniveau — inklusive Materialliste für den Baumarkt-Einkauf und
  Kundenbericht für die Übergabe an den Auftraggeber.
- **Zu Hause / privat** — genauso nutzbar, ganz ohne Handwerksausbildung: der Riss im
  Verputz, der tropfende Wasserhahn, die Pflanze, die trotz Gießen eingeht, der
  Lichtschalter, der nicht mehr reagiert. Einfach den Beruf wählen, der am ehesten
  passt (z.B. Gärtner, Klempner, Elektriker, Maler), und die Diagnose liefert eine
  nachvollziehbare Einschätzung, bevor überhaupt ein Handwerker gerufen wird — inklusive
  Sicherheits-Check, der ehrlich sagt, wann eine Aufgabe besser einem Fachmann
  überlassen wird.

## Was die App kann

**1. Beruf auswählen** — Klempner, Elektriker, Maler, Gärtner, Zimmerer, Mechaniker,
Maurer, Dachdecker, Allround-Handwerker oder Sonstiges. Die Auswahl fließt direkt in
die KI-Diagnose ein und wird pro Nutzer gemerkt (Firestore-Profil). Für Privatnutzer
ist "Allround-Handwerker" oder "Sonstiges" eine gute Wahl, wenn sich das Problem
keinem klassischen Beruf eindeutig zuordnen lässt.

**1b. Berufs-Spezial-Tools** — direkt unter der Berufsauswahl erscheinen (sofern
für den Beruf hinterlegt) zwei zusätzliche KI-Tools, die **sofort nach der
Berufswahl klickbar sind — noch bevor eine Diagnose oder auch nur eine
Problembeschreibung vorliegt** (z.B. beim Klempner ein
Trinkwasserverordnung-Check und ein Normteile-Finder, beim Elektriker ein
VDE-Vorschriften-Check und ein Sicherungs-/Querschnitt-Rechner; volle Liste in
`TRADE_TOOLS`, `src/App.jsx`). Die Antwort wird automatisch so konkret wie
möglich: liegt bereits eine Diagnose vor, bezieht sie sich darauf; sonst auf
die Problembeschreibung; ohne beides gibt sie allgemeine, praxisnahe Hinweise
für den gewählten Beruf. Bei "Allround-Handwerker" erscheint die Vereinigung
aller Berufs-Tools.

**2. Problem dokumentieren** — Foto der Problemstelle hochladen, eine Textbeschreibung
eintippen, oder beides. Mindestens eines der beiden reicht, damit die Analyse startet.
Ein Foto vom Smartphone direkt vor Ort ist oft aussagekräftiger als jede Beschreibung.

**3. KI-Diagnose** — Gemini analysiert Bild und/oder Beschreibung im Kontext des
gewählten Berufs und liefert eine präzise, schrittweise Lösung, formuliert für einen
erfahrenen Handwerker (kein Laien-Geschwurbel, direkt und praxisnah) — verständlich
genug, dass auch Laien ihr zuhause folgen können.

**4. Vier KI-Zusatzwerkzeuge**, jeweils auf Basis der Diagnose per Knopfdruck abrufbar:
- **Materialliste** — strukturierte Liste aus Material und Werkzeug inkl.
  Mengenangabe, direkt als Einkaufszettel für den nächsten Baumarkt-Besuch nutzbar
- **Sicherheits-Check** — Risikoeinschätzung und notwendige persönliche
  Schutzausrüstung (PSA); für Privatnutzer die wichtigste Orientierung, ob eine
  Arbeit noch selbst zu machen ist oder besser einem Fachmann überlassen wird
- **Kundenbericht** — dieselbe Lösung, jargonfrei für Auftraggeber oder Endkunden
  formuliert, inklusive administrativer nächster Schritte (Genehmigungen, Abnahmen)
- **Video-Anleitungs-Suche** — passende YouTube-Tutorials zur Lösung, per
  Google-Search-Grounding gefunden

**5. PDF-Export** — der komplette Bericht (Diagnose, Materialliste, Sicherheits-Check,
Video-Anleitungen, Kundenbericht, Berufs-Spezial-Tool-Ergebnisse, Foto) lässt sich als
druckfertiges PDF exportieren —
direkt weitergebbar an Kunden, an den Handwerker des Vertrauens oder fürs eigene
Archiv.

**6. Verlauf** — jede Analyse wird pro Google-Konto in Firestore gespeichert; die
letzten 20 Analysen lassen sich später erneut aufrufen, ohne Foto oder Beschreibung neu
eingeben zu müssen.

**7. Haftungsausschluss fest im UI** — ein sichtbarer EU-AI-Act-Hinweis macht klar:
die KI-Diagnose ist ein unterstützender Vorschlag, kein Ersatz für die Prüfung durch
einen zertifizierten Fachmann bei sicherheitsrelevanten Arbeiten. Das gilt für
Profis genauso wie für Privatnutzer — gerade bei Elektro- oder Statik-Themen ist die
App eine Einschätzung, keine Freigabe.

**8. Kostenmodell: 20 kostenlose Analysen pro Konto, danach eigener API-Key** —
jedes Konto kann 20 Haupt-Diagnosen kostenlos über den zentralen Gemini-API-Key
nutzen (Live-Zähler direkt in der App). Danach kann im Profil-Menü freiwillig ein
eigener, bei Google AI Studio kostenlos erstellter Gemini-API-Key hinterlegt werden —
alle weiteren Analysen sowie Zusatz-Tools laufen dann automatisch über diesen Key,
die entstehenden Kosten also über das eigene Google-Konto statt über SmartCraft.
Ist das Kontingent aufgebraucht, öffnet sich automatisch eine 4-Schritte-Anleitung,
die direkt zu Google AI Studio verlinkt und den erzeugten Key im selben Dialog
entgegennimmt — kein Suchen im Profil-Menü nötig.

## Ablauf in der Praxis

1. Beruf auswählen (oder aus dem gemerkten Profil übernehmen)
2. Optional sofort die Berufs-Spezial-Tools nutzen — auch ganz ohne Foto/Beschreibung
3. Foto machen und/oder Problem kurz beschreiben
4. Diagnose abwarten (wenige Sekunden)
5. Bei Bedarf Materialliste, Sicherheits-Check und/oder Kundenbericht per Knopfdruck
   ergänzen
6. Alles zusammen als PDF exportieren oder für später im Verlauf ablegen

## Tech-Stack

React 18 + Vite, Tailwind CSS (per `@tailwindcss/vite` zur Build-Zeit kompiliert,
nicht per CDN), Firebase (verpflichtender Google-Login + Firestore),
Google Gemini API (`gemini-flash-lite-latest`) über eine Vercel Serverless Function als
Proxy — der API-Key bleibt dadurch server-seitig und wird nie im Browser sichtbar.
Der Proxy ist zusätzlich per Origin-Check, Firebase App Check (reCAPTCHA v3) und
IP-basiertem Rate-Limiting (12 Anfragen/Minute, 200/Tag, auch für eingeloggte
Nutzer) gegen automatisierten Missbrauch abgesichert (Details unten unter
"Entstehung & technische Hürden"). Für Requests OHNE gültiges Firebase-ID-Token
(z.B. ein Direktzugriff auf den Endpoint am UI vorbei) gilt zusätzlich ein
dauerhaftes IP-Kontingent (30 KI-Anfragen pro IP, siehe `DEMO_LIFETIME_MAX` in
`api/gemini.js`). Echte, per Google eingeloggte Nutzer laufen stattdessen über ein
Pro-Konto-Kontingent von 20 kostenlosen Haupt-Diagnosen (`FREE_TRIAL_MAX` in
`shared/trialLimit.js`, Firestore-Zähler `_analysisQuota/{uid}`) — danach greift
automatisch ein im Profil hinterlegter eigener Gemini-API-Key (siehe oben,
Punkt 8 unter "Was die App kann"). Ein per Firebase Custom Claim (`admin: true`,
vergeben über `scripts/set-admin-claim.mjs`, siehe unten) ausgezeichnetes Konto
umgeht sowohl das Rate-Limiting als auch jedes Kontingent vollständig — der Claim
wird serverseitig aus dem Firebase-ID-Token gelesen (`api/gemini.js`), nirgends im
Code hinterlegt. Technische Fehler
(React-Crashes, Firebase-/Gemini-API-Fehler) werden lokal gepuffert, sobald online
automatisch nach Firestore gemeldet und zusätzlich per Mail zugestellt — pro
Fehlerkontext aber nur einmal, bis er im Admin-Bereich als "gelöst" markiert
wird (`api/report-bug.js`), damit ein verbreiteter Fehler nicht das Postfach
flutet, bevor er überhaupt angesehen werden konnte. Derselbe
Custom Claim schaltet auch den Admin-Bereich (`src/AdminPanel.jsx`) frei, der sie
projektweit zusammenfasst — Zugriff wird durch `firestore.rules` durchgesetzt, nicht
nur durch die App-UI. Über einen freischwebenden "Feedback"-Button (unten
rechts, immer sichtbar) kann jeder Nutzer freiwillig eine Nachricht direkt
an den Entwickler schicken
(`src/FeedbackModal.jsx` → `api/send-feedback.js`) — per Mail über denselben
Resend-Dienst wie die Fehlerreports, mit eigenem Rate-Limit, aber ohne
Firestore-Speicherung.

## Lokales Setup

```bash
npm install
cp .env.example .env
# .env ausfüllen: GEMINI_API_KEY + VITE_FIREBASE_* (siehe Firebase-Projekteinstellungen)
npm run dev
```

Die Serverless-Function unter `api/gemini.js` läuft lokal nur über
`vercel dev` (nicht über `npm run dev` allein) — für reines Frontend-Testen
reicht `npm run dev`, für die volle KI-Funktion lokal: `vercel dev`.

## Tests

```bash
npm test          # einmaliger Lauf (Vitest)
npm run test:watch
```

Aktuell abgedeckt: die sicherheits-/kontingentkritischen Teile der
Serverless-Functions — `verifyFirebaseIdToken` und `chunkText` in
`api/tts.test.js`, `checkRateLimit`/`checkAndConsumeTrial` in
`api/gemini.test.js` (gegen eine In-Memory-Fake-Implementierung von
`firebase-admin/firestore`, kein echtes Firestore-Projekt nötig). Weitere
Bereiche (Frontend-Komponenten, restliche `api/*.js`-Endpoints) haben noch
keine Tests.

## Firestore Security Rules

Firestore wurde im Produktionsmodus angelegt (alles standardmäßig gesperrt).
Die Regeln aus [`firestore.rules`](./firestore.rules) müssen einmalig in der
Firebase Console unter **Firestore Database → Regeln** eingetragen werden.
Sie beschränken Lese-/Schreibzugriff auf den jeweils eigenen Nutzer.

## Google-Login aktivieren (Pflicht)

Die App ist ohne Google-Anmeldung nicht nutzbar — `App.jsx` zeigt statt der
Hauptansicht ein Login-Gate, solange kein per Google authentifizierter Nutzer
vorliegt. Damit das funktioniert, muss in der Firebase Console unter
**Authentication → Sign-in method** der Provider **Google** aktiviert sein.
Kein zusätzlicher Env-Var nötig — läuft über die bestehenden
`VITE_FIREBASE_*`-Werte. Eine vor der Umstellung auf verpflichtenden Login
im Browser bestehende anonyme Alt-Sitzung wird beim ersten Google-Login per
Firebase Account-Linking übernommen (gleiche UID, Verlauf bleibt erhalten)
statt verworfen zu werden.

## Deployment (Vercel)

Environment Variables in den Vercel-Projekteinstellungen:

| Variable | Sichtbarkeit | Quelle |
|---|---|---|
| `GEMINI_API_KEY` | server-only (kein `VITE_`-Prefix) | aistudio.google.com/apikey |
| `GOOGLE_TTS_API_KEY` | server-only | Google Cloud Console → APIs & Dienste → Anmeldedaten (Cloud Text-to-Speech API muss aktiviert sein, Abrechnungskonto erforderlich) |
| `VITE_FIREBASE_API_KEY` | client (öffentlich vorgesehen) | Firebase-Projekteinstellungen → Meine Apps |
| `VITE_FIREBASE_AUTH_DOMAIN` | client | „ |
| `VITE_FIREBASE_PROJECT_ID` | client | „ |
| `VITE_FIREBASE_STORAGE_BUCKET` | client | „ |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | client | „ |
| `VITE_FIREBASE_APP_ID` | client | „ |
| `VITE_FIREBASE_MEASUREMENT_ID` | client | „ |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | server-only (optional, aktiviert App Check + Rate-Limiting, sonst fail-open; treibt auch `scripts/set-admin-claim.mjs`) | Firebase Console → Projekteinstellungen → Dienstkonten |
| `VITE_RECAPTCHA_SITE_KEY` | client (optional, aktiviert App Check clientseitig) | Firebase Console → App Check → Web-App registrieren |
| `VITE_ADMIN_EMAIL` | client (nur für den Mailto-Link im Admin-Bereich, kein Zugriffsschutz) | eigene Admin-Adresse |
| `RESEND_API_KEY` | server-only | resend.com/api-keys |
| `SUPPORT_EMAIL` | server-only (fällt auf `VITE_ADMIN_EMAIL` zurück) | eigene Support-Adresse |
| `RESEND_FROM_EMAIL` | server-only (optional) | eigene verifizierte Domain, siehe resend.com/domains |

## Bekannte Einschränkungen & Ausblick

- **App-Start-Log im Admin-Bereich (`api/app-start.js`) nutzt Vercels
  `x-vercel-ip-country`/`x-vercel-ip-city`-Header** für eine grobe
  Standortauflösung (Land/Stadt, keine IP-Speicherung). Diese Header liefert
  nur Vercels Edge-Netzwerk — lokal (`vite dev`/`preview`) fehlen sie, dann
  läuft der Eintrag unter der Region "Unbekannt". Eigene Aufrufe des
  Admin-Kontos werden client- und serverseitig ausgeschlossen. Optional wird
  die Firebase-UID des angemeldeten Google-Kontos als `visitorId` mitgeloggt
  (dieselbe UID, die ohnehin für die Verlaufs-Funktion existiert) — damit
  lassen sich wiederkehrende Konten erkennen. Ein Eintrag pro Start
  (`artifacts/{appId}/appStarts`,
  Firestore ohne eingebaute Aufbewahrungsfrist) wächst unbegrenzt — bei
  nennenswertem Nutzeraufkommen sollte dafür eine Firestore-TTL-Policy auf das
  `timestamp`-Feld eingerichtet werden (Firebase Console/`gcloud`, kein
  App-Code), um alte Einträge automatisch zu löschen. Diese Verarbeitung
  (Zeitstempel + grobe Region + pseudonyme Geräte-ID) ist in der
  Datenschutzerklärung (`src/LegalPanel.jsx`, Footer-Link "Impressum &
  Datenschutz") dokumentiert.
- **App Check + Rate-Limiting/Demo-Kontingent für `/api/gemini` sind optional**
  (ohne `FIREBASE_SERVICE_ACCOUNT_KEY`/`VITE_RECAPTCHA_SITE_KEY` läuft
  `api/gemini.js` im dokumentierten Fail-open-Modus: Origin-Check bleibt
  aktiv, aber weder App Check noch das 30-Anfragen-Demo-Kontingent aus
  `DEMO_LIFETIME_MAX` werden durchgesetzt). Beim erstmaligen Einrichten in
  der Firebase Console zwei leicht zu verwechselnde Fallstricke: (1) Im
  App-Check-Registrierungsdialog der Web-App wird ein **reCAPTCHA-v3-Secret-
  Schlüssel** verlangt (aus der reCAPTCHA-Admin-Konsole, google.com/recaptcha/admin,
  bei der jeweiligen Site) — nicht der Site Key, der als
  `VITE_RECAPTCHA_SITE_KEY` ins Frontend geht. Ein vertauschter Key äußert
  sich als `FirebaseError: AppCheck: … (appCheck/throttled)` nach
  vorangegangenem 400. (2) Mit aktivem App Check + Firestore-Rate-Limit-
  Transaktion reicht Vercels Default-Timeout von 10s für den Gemini-
  Vision-Aufruf oft nicht mehr — deshalb `export const config = { maxDuration: 30 }`
  in `api/gemini.js`.
- **`RESEND_API_KEY`/`SUPPORT_EMAIL`/`VITE_ADMIN_EMAIL` sind im deployten
  Projekt gesetzt** — die automatische Mail-Benachrichtigung bei
  Fehlerreports (`api/report-bug.js`/`errorReporting.js`) ist aktiv.
  `RESEND_FROM_EMAIL` ist nicht gesetzt, Versand läuft daher über Resends
  Sandbox-Absender `onboarding@resend.dev` — dieser darf laut Resend nur an
  die beim Resend-Konto hinterlegte Signup-Adresse zustellen. Empfangen
  Fehlerreports trotz gesetztem `RESEND_API_KEY` keine Mail, zuerst prüfen,
  ob `SUPPORT_EMAIL`/`VITE_ADMIN_EMAIL` mit dieser Adresse übereinstimmt;
  sonst `RESEND_FROM_EMAIL` auf eine in resend.com/domains verifizierte
  eigene Domain setzen. Der Firestore-Weg (Admin Panel, `AdminPanel.jsx`) ist
  von alldem unabhängig und bleibt die verlässliche Quelle; die Mail ist nur
  ein zusätzlicher Sofort-Hinweis, siehe Kommentar in `errorReporting.js`.
- **TTS (Sprachausgabe)** liest die KI-Diagnose auf Wunsch vor — praktisch auf der
  Baustelle, wenn beide Hände beschäftigt sind. Zwei Engines garantieren dabei
  immer Ton — nie eine Sackgasse ohne Audio:
  - **Premium-TTS** läuft für jeden angemeldeten Nutzer über einen eigenen
    Server-Proxy (`api/tts.js`, gleiches Muster wie `api/gemini.js`) zur
    Google Cloud Text-to-Speech API (WaveNet-Stimmen `de-DE-Wavenet-A`/`-B`)
    — bis zu einem serverseitig durchgesetzten Tageskontingent von
    `PREMIUM_TTS_DAILY_MAX` (`shared/ttsQuota.js`, Stand: 15) pro Nutzer
    (Firestore-Zähler `_ttsPremiumQuota/{uid}`, per ID-Token verifiziert,
    nicht vom Client behauptet). Ist das Kontingent aufgebraucht oder liefert
    der Server einen Fehler (Rate-Limit, 5xx, ...), schaltet `speakText()`
    automatisch und **ohne Fehlermeldung** auf die browsereigene Web Speech
    API um (`window.speechSynthesis`, kostenlos, kein Server-Call).
    `pickBrowserVoice()` (`src/App.jsx`) wählt dabei per bekannten
    Stimmnamen-Mustern eine deutsche, zum gewählten Geschlecht passende
    Stimme; ohne Treffer die erste verfügbare deutsche Stimme, sonst die
    Browser-Standardstimme.
  - Die Audiodaten der Premium-Engine (MP3, base64) werden über ein
    `<audio>`-Element abgespielt und pro Modus+Geschlecht clientseitig
    zwischengespeichert, damit erneutes Abspielen keine erneute
    (kostenpflichtige) Anfrage auslöst — die Browser-Engine braucht kein
    Caching (kostenlos, synchron verfügbar). Weiblich/männlich wählt in
    beiden Engines echte, unterschiedliche Stimmen; Standard ist männlich.
    Ein zweiter Umschalter wählt zwischen "Kurz" (nur die wichtigsten
    Punkte, per Gemini zusammengefasst und für die aktuelle Diagnose
    zwischengespeichert — Standard) und "Vollständig" (der komplette
    Diagnosetext, bei der Premium-Engine serverseitig an Satzenden in
    Häppchen unter 5000 Byte aufgeteilt, da die Cloud-API das pro Anfrage
    limitiert) — unabhängig davon, welche Engine gerade spielt.
  - Premium-TTS läuft im kostenlosen Kontingent von Google Cloud (Stand:
    1 Mio. Zeichen/Monat für WaveNet-Stimmen), benötigt aber ein
    GCP-Projekt mit aktivierter Abrechnung und API — siehe
    `GOOGLE_TTS_API_KEY` in der Env-Var-Tabelle unten. Kostenschutz kommt
    über das Tageskontingent (Code-Konstante, kein Env-Var, analog
    `DEMO_LIFETIME_MAX`) statt — wie bis V1.26.6 — über ein einzelnes
    freigeschaltetes Konto.
- **Google-Login ist verpflichtend:** ohne Google-Anmeldung ist die App nicht
  nutzbar (Login-Gate in `App.jsx`, siehe "Google-Login aktivieren" oben). Eine
  anonyme Gast-Nutzung ohne Konto gibt es seit V2.2.0 nicht mehr — historisch
  startete jeder Nutzer zunächst anonym und konnte die Sitzung im Profil-Menü
  freiwillig per Google-Konto "aufwerten" (Firebase Account-Linking auf eine
  bestehende anonyme Sitzung); dieser Linking-Mechanismus greift weiterhin für
  Alt-Sitzungen aus dieser Zeit, ist aber kein separater, optionaler Pfad mehr.
- **Berufs-Sondereditionen & dedizierter Privat-Modus** sind als nächste große
  Ausbaustufe geplant: eigene Editionen pro Beruf (z.B. Sm@rtCraft Elektro,
  Sm@rtCraft Garten) sowie eine eigene "Sm@rtCraft Zuhause"-Variante mit spürbar
  konservativerer Sicherheitsschwelle für sicherheitsrelevante Arbeiten durch Laien.
  Heute funktioniert Privatnutzung bereits über die bestehende Berufsauswahl, aber
  ohne eigene, auf Laien zugeschnittene Führung.
