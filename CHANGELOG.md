# Changelog

Alle nennenswerten Änderungen an Sm@rtCraft – Der Kollege in der Hosentasche, chronologisch
nach Version. Die Versionsnummer stammt einzig aus `package.json` (siehe
`CLAUDE.md`) und wird als `V{version}` im App-Header angezeigt.

Bis einschließlich V1.7.1 wurde die Version noch nicht bei jedem Commit
konsequent gepflegt — die ersten drei Einträge unten gehören alle zu
demselben Versionsstand.

## [2.18.1] – 2026-08-28

### Geändert
- **Nachgeholte Offline-Analysen ohne Umweg über die allgemeine Historie
  auffindbar.** Problem: Nach dem Hinweis "X gespeicherte Analyse(n) wurden
  automatisch nachgeholt — im Verlauf einsehbar" (V2.18.0) musste man erst
  über das Profil-Menü in die allgemeine Cloud-Historie wechseln und den
  passenden Eintrag unter den letzten 20 Analysen suchen — aus Gewohnheit
  hätte ein Nutzer stattdessen direkt auf den Hinweis-Banner selbst geklickt.
  Lösung: `saveAnalysis` (`src/App.jsx`) markiert Analysen, die von der
  Offline-Warteschlange automatisch nachgeholt wurden, jetzt mit
  `syncedFromOffline: true`. `AnalysisHistoryModal` bekommt dafür einen
  eigenen Tab "Offline nachgeholt", der die Cloud-Historie clientseitig
  danach filtert (kein zusätzlicher Firestore-Query nötig, analog zum
  bestehenden "In der Nähe"-Tab). Der Erfolgs-Banner selbst ist jetzt
  antippbar und öffnet die Historie direkt auf diesem Tab. Betrifft nur
  künftig nachgeholte Analysen — bereits vor diesem Update synchronisierte
  Einträge tragen das Feld nicht rückwirkend und bleiben nur im normalen
  Cloud-Tab sichtbar.

## [2.18.0] – 2026-08-28

### Hinzugefügt
- **Neue Analyse trotz kompletter Funkstille möglich, statt nur "App startet
  offline" (V2.17.0).** Problem: Auch mit dem PWA-Offline-Start aus V2.17.0
  war eine NEUE Analyse ohne Empfang schlicht nicht möglich — auf der
  Baustelle (Kernzielgruppe der App) das eigentlich relevante Szenario. Ein
  Nutzer, der die App einmal ohne Ergebnis abgewiesen erlebt, benutzt sie laut
  Nutzer-Feedback vermutlich gar nicht mehr. Lösung: Zwei sich ergänzende
  Bausteine.
  1. **Analyse-Warteschlange mit Auto-Sync:** Löst man "Problem analysieren"
     ohne Verbindung aus (Button zeigt dann "Für später speichern (offline)",
     `src/App.jsx`), wird die komplette Anfrage (Bilder, Beschreibung, Beruf)
     lokal per IndexedDB gespeichert (`src/offlineAnalysisQueue.js`) statt
     einen Fehler zu zeigen. Ein neuer Effect in `src/App.jsx` verarbeitet die
     Warteschlange automatisch, sobald `isOnline` wieder `true` wird: exakt
     dieselbe `/api/gemini`-Anfrage wie bei einer normalen Analyse (Query-
     Aufbau in `buildAnalysisUserQuery` aus `callGeminiVisionAPI`
     ausgelagert, damit beide Pfade garantiert dasselbe Ergebnis liefern),
     Speicherung des Ergebnisses per `saveAnalysis` wie gewohnt im
     Firestore-Verlauf. Bricht bei einem Fehler (z.B. erneuter
     Verbindungsabbruch, aufgebrauchtes Kontingent) bewusst ab und lässt die
     restlichen Einträge unangetastet in der Warteschlange, statt sie zu
     verwerfen — der nächste `online`-Event versucht es erneut.
  2. **Statische Offline-Kurzhilfe je Beruf** (`src/offlineQuickHelp.jsx`,
     erreichbar über "Sofort-Checkliste ohne Internet ansehen" im
     Offline-Banner): fest hinterlegte, sofort verfügbare Checklisten mit
     den häufigsten Problemfällen und einem Sicherheitshinweis für jeden der
     neun Berufe plus Allround-Fallback — komplett ohne KI und ohne jede
     Verbindung, überbrückt die Zeit bis zur echten Diagnose.
  Beide Bausteine sowie das bestehende Offline-Verhalten aus V2.17.0 per
  Playwright-Test verifiziert (App-Shell-Start offline, Kurzhilfe-Modal-Inhalt,
  Queueing samt Warteschlangen-Eintrag in IndexedDB).

## [2.17.0] – 2026-08-28

### Hinzugefügt
- **Offline-Nutzung auf der Baustelle (kein Empfang).** Problem: Ohne Netz war
  die App komplett unbenutzbar — beim Neustart lud sie gar nicht erst (kein
  Service Worker, kein gecachter App-Shell), und Firestore-Zugriffe (Verlauf,
  Profil) hatten keinerlei Offline-Cache, sondern hingen einfach fest. Ursache:
  Die App wurde bisher rein als klassische Online-SPA betrieben, ohne PWA-
  Infrastruktur und mit `getFirestore(app)` in Standard-Konfiguration. Lösung:
  `vite-plugin-pwa` ergänzt (`vite.config.js`) — cached App-Shell
  (HTML/JS/CSS/Icons) beim ersten Online-Besuch per Service Worker, damit ein
  späterer Start ganz ohne Verbindung trotzdem funktioniert
  (`registerType: 'autoUpdate'`, Registrierung in `src/main.jsx`). Icons/Web-
  Manifest via `@vite-pwa/assets-generator` aus dem vorhandenen Favicon erzeugt
  (`pwa-assets.config.js`, neue Dateien unter `public/`). Firestore läuft jetzt
  über `initializeFirestore` mit `persistentLocalCache` +
  `persistentMultipleTabManager` statt `getFirestore(app)` (`src/App.jsx`) —
  bereits geladene Daten (Verlauf, Profil) bleiben dadurch offline sichtbar,
  neue Schreibvorgänge werden lokal gequeued und synchronisieren automatisch
  bei wiederhergestellter Verbindung. Ein neuer, automatisch ein-/
  ausblendender "Kein Empfang"-Banner (`navigator.onLine` +
  `online`/`offline`-Events) informiert währenddessen darüber, dass neue
  KI-Analysen erst mit Verbindung wieder möglich sind. Per Playwright-Test
  verifiziert: App-Shell inkl. UI lädt vollständig, wenn der Browser nach
  einem ersten Online-Besuch offline geschaltet wird.

## [2.16.4] – 2026-08-28

### Geändert
- **CSS-Variablen `--color-gold`/`--color-gold-light` in `--color-steel`/
  `--color-steel-light` umbenannt.** Problem: Die Variablen hießen "Gold",
  ihre Werte (`#3d7fb8`/`#6fb1e8`) sind aber Blautöne — irreführende
  Benennung, die künftig zu Verwechslungen führen kann (z.B. Erwartung von
  Gelb/Gold beim Lesen des Codes). Ursache: Vermutlich frühere echte
  Gold-Werte, die auf Blau umgestellt wurden, ohne die Bezeichner
  anzupassen. Lösung: Variablen in `src/index.css` sowie alle davon
  abgeleiteten Tailwind-Utilities (`border-gold` → `border-steel`,
  `text-gold-light`/`fill-gold-light` → `text-steel-light`/
  `fill-steel-light`, `ring-gold` → `ring-steel`) und die Klasse `.btn-gold`
  → `.btn-steel` in `src/App.jsx` konsistent umbenannt; ebenso die
  SVG-Gradient-ID `headerGoldGrad` → `headerSteelGrad` und zugehörige
  Kommentare, die den Farbton weiterhin "Gold" nannten.

## [2.16.3] – 2026-08-28

### Geändert
- **Berufsspezifische Farbpalette überarbeitet.** Problem: Die Akzentfarben
  in `TRADE_THEMES` (`src/App.jsx`) waren für 8 der 9 Berufe verschiedene
  Blautöne (nur "Tischler/Schreiner" war braun) — in der Berufsauswahl
  (Abschnitt 1) und den Verlaufs-Badges kaum auf einen Blick unterscheidbar.
  Zusätzlich zeigten die Beruf-Badges in der Verlauf-Historie (Cloud/"In der
  Nähe"/Lokal-Tab, `AnalysisHistoryModal`) durchgängig die Farbe des aktuell
  global gewählten Berufs statt der Farbe des Berufs, zu dem der jeweilige
  Verlaufseintrag tatsächlich gehört. Lösung: Jedem Beruf eine eigene,
  thematisch passende und weiterhin gedeckte Farbe zugewiesen (z.B.
  Wasser-Blau/Türkis beim Klempner, Bernstein/Bronze beim Elektriker,
  Grün beim Gärtner, Ziegelrot beim Maurer, Schiefer-Blau beim Dachdecker,
  neutrales Grau beim Mechaniker) statt größtenteils gleicher Blautöne; die
  drei Verlaufs-Badges (`src/App.jsx`) lesen die Akzentfarbe jetzt per
  `TRADE_THEMES[item.selectedTrade]` (mit Fallback auf den Standardberuf)
  statt der global aktiven `--accent-soft`/`--accent-dark`-CSS-Variablen.

## [2.16.2] – 2026-08-28

### Geändert
- **Versionsnummer aus dem Hauptbildschirm-Header entfernt, jetzt klein im
  Profil-Modal.** Problem: Die Versionsnummer (`V{__APP_VERSION__}`) stand
  bisher direkt neben dem "Sm@rtCraft!"-Schriftzug im Header der
  Haupt-App-Ansicht — unnötig prominent für eine reine Debug-/Support-Info.
  Ursache: Anzeige war fest im `<h1>` der Kopfleiste verankert
  (`src/App.jsx`). Lösung: Versionshinweis aus dem Header entfernt und
  stattdessen klein unten rechts im Profil-Modal ("Mein Konto",
  `UserProfileModal`) platziert — dort, wo Nutzer ohnehin ihre
  Kontoeinstellungen verwalten. Der Login-Gate-Screen (vor der Anmeldung)
  zeigt die Version unverändert weiter an.

## [2.16.1] – 2026-08-28

### Geändert
- **Reihenfolge der Berufsauswahl & Zeilenumbruch der Karten-Texte.**
  Problem 1: "Tischler/Schreiner" stand in der Berufsauswahl (Abschnitt 1)
  weit entfernt vom fachlich eng verwandten "Zimmerer". Problem 2: Lange
  Berufsnamen ("Tischler/Schreiner", "Allround-Handwerker") liefen auf den
  schmalen Auswahl-Karten (`TradeButton` in `src/App.jsx`) über die
  Kartengrenze hinaus in die Nachbarkarte, statt umzubrechen. Ursache 2: Der
  `<span>` mit dem Beruf-Namen ist ein Flex-Kind des Buttons, der wiederum
  ein Grid-Item ist — beide erben per CSS-Default `min-width: auto`, wodurch
  sie nicht unter ihre Inhaltsbreite schrumpfen und `overflow-wrap`/
  `hyphens` trotz gesetzter Klassen wirkungslos blieben. Lösung: (1)
  "Tischler/Schreiner" und "Gärtner" tauschen in `TRADE_ICONS` die Position,
  sodass Tischler/Schreiner jetzt direkt neben Zimmerer steht — Allround-
  Handwerker bleibt weiterhin der letzte Eintrag. (2) `min-w-0` auf Button
  und Span erzwingt das Schrumpfen unter die Inhaltsbreite, wodurch
  `break-words`/`hyphens-auto` greifen; zusätzlich schafft reduziertes
  Padding (`px-0 py-1` am Button, `p-2`/`gap-1.5` am Grid) mehr Platz für
  den Text, und ein Zero-Width-Space nach dem "/" gibt dem Browser dort
  eine bevorzugte, saubere Umbruchstelle statt eines mitten im Wort
  erzwungenen Umbruchs.

## [2.16.0] – 2026-08-28

### Geändert
- **"Sonstige" aus der Berufsauswahl entfernt.** Problem: In Abschnitt 1
  ("Beruf auswählen") ließ sich neben "Allround-Handwerker" auch "Sonstige"
  wählen — beide fungierten faktisch als Sammelbecken, "Sonstige" ergab
  daher keinen eigenständigen Mehrwert. Ursache: `TRADE_ICONS`/
  `TRADE_THEMES` in `src/App.jsx` enthielten einen eigenen "Sonstig..."-
  Eintrag, der lediglich `[GEWERK: Sonstiges]` in den KI-Prompt einspeiste.
  Lösung: "Sonstige" entfernt und stattdessen ein echter, bisher fehlender
  Beruf ("Tischler/Schreiner") in die Liste aufgenommen — "Allround-
  Handwerker" bleibt weiterhin der letzte Eintrag, damit dort wie gehabt
  die Vereinigung aller Berufs-Spezial-Tools erscheint
  (`currentTradeTools`). Der dadurch überflüssige Sonderfall in der
  `tradeContext`-Ermittlung (Analyse-Prompt) wurde ebenfalls entfernt.

## [2.15.0] – 2026-08-27

### Hinzugefügt
- **Bilder beim Teilen der Analyse.** Problem: Der "Teilen"-Button
  (`ShareModal.jsx`) hat bisher ausschließlich den Analysetext übergeben —
  zur Analyse hochgeladene Fotos gingen beim Teilen verloren. Ursache:
  `shareText` in `App.jsx` baut nur reinen Text auf; `selectedImages`
  (Base64-Bilder) wurden nicht an `ShareModal` weitergereicht. Lösung:
  `App.jsx` übergibt `selectedImages` jetzt zusätzlich als `images`-Prop.
  `ShareModal.jsx` nutzt sie für zwei Wege: (1) beim nativen
  Geräte-Share-Sheet (`navigator.share`) werden die Bilder als Dateien
  mitgeschickt, sofern die Plattform das per `navigator.canShare({files})`
  unterstützt; (2) für WhatsApp-/Telegram-/`mailto:`-Links, die technisch
  keine Dateianhänge über die URL erlauben, gibt es einen neuen
  "Bilder herunterladen"-Button zum manuellen Anhängen im jeweiligen Chat
  bzw. der E-Mail, inklusive Hinweistext im Modal.

## [2.14.2] – 2026-08-27

### Geändert
- **Button-Reihenfolge im Analyseergebnis:** "Als PDF exportieren" und
  "Lokal speichern" (`src/App.jsx`, `ResultDisplay`) sitzen jetzt direkt nach
  dem KI-Analyse-Text und vor dem Sprachausgabe-Bereich ("Diagnose
  vorlesen") statt wie bisher ganz unten nach allen Zusatz-Tool-Ergebnissen.
  "Lokal speichern" steht dabei unterhalb von "Als PDF exportieren" (beide
  Buttons jetzt untereinander statt nebeneinander). Der "Teilen"-Button
  bleibt unverändert am Ende des Ergebnis-Bereichs.

## [2.14.1] – 2026-08-27

### Dokumentation
- **`error_log.md`-Eintrag 5 aktualisiert:** Das bekannte, code-seitig nicht
  behebbare Free-Tier-Kontingent-Problem des zentralen `GEMINI_API_KEY`
  (Google-Cloud-Projekt ohne aktiviertes Billing, siehe Eintrag 5) trat am
  27.8.2026 erstmals auch bei `gemini-video-search-api` auf ("You exceeded
  your current quota..."). Kein Code-Fehler — Ursache und Lösungsansatz
  (Billing im Google-Cloud-Projekt aktivieren) sind bereits dokumentiert;
  Eintrag nur um den neuen Kontext (Video-Suche nutzt zusätzlich
  Google-Search-Grounding mit vermutlich nochmal engerem Kontingent) ergänzt.

## [2.14.0] – 2026-08-27

### Hinzugefügt
- **Standort-Erkennung (optional, GPS).** Neuer Opt-in-Schalter im
  Profil-Menü (`UserProfileModal` in `src/App.jsx`, Firestore-Feld
  `locationFeatureEnabled` im Profil-Dokument): ist er aktiv, wird bei jeder
  neuen Analyse über die Geolocation-API des Browsers der GPS-Standort
  ermittelt und zusammen mit der Analyse in Firestore gespeichert
  (`saveAnalysis`, Feld `location: {lat, lng}`). Beim App-Start prüft ein
  neuer Effect, ob der aktuelle Standort einer früheren Analyse desselben
  Kontos entspricht (Umkreis 75m, Haversine-Distanz, rein client-seitig über
  die ohnehin geladenen letzten 20 Cloud-Analysen — kein Geohash-Setup
  nötig) und zeigt bei einem Treffer
  einen Hinweis-Banner ("Sie waren hier schon X Mal") mit direktem Link in
  einen neuen dritten Reiter "In der Nähe" im Verlauf-Modal
  (`AnalysisHistoryModal`). Fehlt die Browser-Berechtigung, degradiert die
  Funktion still (kein Absturz, kein Standort gespeichert) — passend zum
  bisherigen Datensparsamkeits-Ansatz der App ist die Funktion standardmäßig
  **aus** und erfordert eine explizite Zustimmung, nicht nur die
  Browser-Berechtigungsabfrage. Datenschutz-Text ergänzt in
  `src/LegalPanel.jsx` §17 (und §4 um das neue Feld erweitert).

## [2.13.0] – 2026-08-27

### Hinzugefügt
- **Fünftes KI-Zusatzwerkzeug: Kostenschätzung.** Neben Materialliste,
  Sicherheits-Check, Video-Anleitung und Kundenbericht liefert ein neuer
  Button (`callGeminiCostAPI` in `src/App.jsx`, `SYSTEM_INSTRUCTION_COST`)
  auf Basis der Diagnose eine grobe Kostenspanne für Material und
  Arbeitszeit inkl. Stundensatz-Schätzung — mit ausdrücklichem Hinweis, dass
  es sich um eine unverbindliche Orientierung handelt, gerade für
  Privatnutzer, die vor einer Handwerker-Beauftragung eine erste Hausnummer
  brauchen. Ergebnis ist wie bei Sicherheits-Check/Kundenbericht in
  PDF-Export und "Teilen"-Text eingebunden.

## [2.12.0] – 2026-08-27

### Hinzugefügt
- **Analysen optional lokal inkl. Bilder speichern.** Firestore speichert
  Analysen bisher bewusst ohne Bild (`saveAnalysis` in `src/App.jsx`, siehe
  Kommentar "zu groß für Firestore") — dadurch gingen beim Nachladen eines
  Verlaufseintrags immer die Fotos verloren (`handleSelectAnalysis` setzt
  `selectedImages` auf `[]`). Neuer "Lokal speichern"-Button neben Teilen/
  PDF-Export (Hauptergebnis-Bereich und reine Berufs-Tool-Ergebnisse) legt die
  Analyse stattdessen per Knopfdruck **inklusive aller Fotos** rein
  clientseitig in IndexedDB ab (neues `src/localAnalyses.js`, keine neue
  Abhängigkeit) — kein Upload, keine Firestore-Größenbeschränkung. Das
  Verlauf-Modal (`AnalysisHistoryModal`) zeigt beide Ablagen jetzt über zwei
  Reiter ("Cloud" / "Lokal (mit Bildern)"); lokale Einträge lassen sich
  einzeln löschen und laden beim Auswählen (`handleSelectLocalAnalysis`) auch
  die Fotos wieder in die Bildauswahl.

## [2.11.0] – 2026-08-27

### Hinzugefügt
- **Analysen teilen (WhatsApp, Telegram, E-Mail & Co.).** Neuer "Teilen"-
  Button neben dem PDF-Export (sowohl im Hauptergebnis-Bereich als auch bei
  reinen Berufs-Spezial-Tool-Ergebnissen ohne abgeschlossene Diagnose) öffnet
  ein neues `src/ShareModal.jsx` (nach dem Modal-Muster von
  `FeedbackModal.jsx`). Das Analyseergebnis (Lösung, Materialien,
  Sicherheits-Tipps, Video-Links, Kundenbericht, Berufs-Tool-Ergebnisse) wird
  in `src/App.jsx` als reiner Text aufbereitet (`shareText`, analog zur
  HTML-Aufbereitung in `handleExportPdf`, da Messenger/E-Mail-Clients kein
  HTML aus einem geteilten Text-Payload rendern) und darüber wahlweise per
  `wa.me`-Link (WhatsApp), Telegram-Share-Link, `mailto:`, In-die-
  Zwischenablage-Kopieren oder — sofern der Browser das unterstützt — über
  das native Geräte-Share-Sheet (`navigator.share`, deckt auf Mobilgeräten
  zusätzlich beliebige weitere installierte Apps ab) geteilt.

## [2.10.0] – 2026-08-27

### Hinzugefügt
- **Mehrere Bilder pro Analyse.** Bisher ließ sich nur ein einzelnes Foto
  auswählen (`selectedImageBase64`), jede neue Auswahl ersetzte das
  vorherige Bild. Jetzt hält `src/App.jsx` eine Liste (`selectedImages`,
  max. `MAX_IMAGES = 5`) — die Galerie-Auswahl erlaubt Mehrfachauswahl
  (`<input multiple>`), Kamera und Galerie lassen sich beliebig oft
  nacheinander nutzen, um weitere Bilder zu sammeln, und jedes Bild ist in
  einer Vorschau-Kachelansicht einzeln per (X) entfernbar. Alle
  ausgewählten Bilder gehen als separate `inlineData`-Teile an Gemini
  (`callGeminiVisionAPI`) und erscheinen im PDF-Export (`handleExportPdf`).
  Die Obergrenze von 5 Bildern ist ein Sicherheitspuffer gegen das
  4,5MB-Payload-Limit der Vercel-Serverless-Function (siehe
  FUNCTION_PAYLOAD_TOO_LARGE in `error_log.md`), da jedes einzelne Bild
  bereits auf max. 1600px/JPEG-Qualität 0.82 herunterskaliert ist.

## [2.9.5] – 2026-08-26

### Geändert
- **Zwei Wartbarkeitsprobleme aus einem Code-Review von `src/App.jsx` behoben,
  ohne Verhaltensänderung für Nutzer:innen.**
  - `ApiKeyOnboardingModal` und `UserProfileModal` waren als verschachtelte
    Komponenten *innerhalb* der `App`-Funktion definiert statt auf
    Modulebene. React behandelt eine verschachtelt definierte Komponente bei
    jedem Re-Render der Elternkomponente als neuen Komponenten-Typ — das
    erzwingt ein volles Unmount/Remount des Dialogs inklusive Verlust des
    lokalen Eingabe-Entwurfs (`keyDraft`/`apiKeyDraft`), sobald sich
    irgendein anderer `App`-State ändert, während der Dialog offen ist.
    Beide Komponenten sind jetzt auf Modulebene definiert und bekommen ihre
    bisher aus dem Closure gelesenen Werte (`authUser`, `userId`, `auth`,
    `trialRemaining`, `ownApiKey`, `saveOwnApiKey`, `handleReset`,
    `onClose`/`onShowHistory`/`onShowAdmin`) explizit als Props.
  - Die sieben `/api/gemini`-Aufrufer (Hauptanalyse, TTS-Kurzfassung,
    Materialien, Sicherheit, Kundenbericht, Berufs-Spezial-Tools,
    Video-Suche) wiederholten je ~20-40 Zeilen praktisch identisches
    Fetch-/Parse-/Fehlerbehandlungs-Boilerplate (insgesamt einige hundert
    Zeilen Duplikation). Ausgelagert in drei gemeinsame Helfer
    (`callGeminiApi`, `handleGeminiError`, `reportEmptyResult`) — jeder
    Aufrufer behält nur noch seinen eigenen Payload-Aufbau und die für ihn
    spezifische Erfolgs-/Ergebnis-Verarbeitung. Verhalten (Fehlermeldungen,
    402-Onboarding, Admin-Fehlerreports) bleibt dabei unverändert; per
    Playwright-Smoke-Test beider hoisteter Modals sowie `npm run build` und
    `npm test` (23/23) verifiziert.

## [2.9.4] – 2026-08-26

### Behoben
- **Seitenhintergrund war in Produktion vermutlich schon unsichtbar: die
  extern gehostete Bild-URL ist tot.** Der Seitenhintergrund (Lade-Screen,
  Login-Gate, Hauptansicht in `src/App.jsx`) lud bislang ein Foto von
  `https://storage.googleapis.com/bacon-images-prod/gemini/app_builder/werkzeuge.jpg`.
  Beim Versuch, dieses Bild für ein lokales Hosting herunterzuladen, stellte
  sich heraus, dass die URL bereits mit `404 NoSuchBucket` fehlschlägt — der
  Bucket `bacon-images-prod` existiert nicht mehr (auch im Wayback-Archiv
  nicht auffindbar). Nutzer sahen damit vermutlich schon länger nur den
  grauen `bg-gray-800`-Fallback statt des beabsichtigten Fotos. Da sich das
  Originalbild nicht wiederherstellen ließ, ersetzt durch einen reinen
  CSS-Verlauf (`.app-backdrop` in `src/index.css`) in den bestehenden
  Wood-/Gold-Theme-Farbtönen — dusk-artiger Verlauf mit sanftem Glanz
  hinter der Kopfzeile. Kein externer Request mehr nötig, funktioniert
  damit auch offline oder wenn Drittanbieter-Hosts ausfallen.

## [2.9.3] – 2026-08-26

### Geändert
- **Icon-only Buttons und Formularfelder ohne sichtbaren Text bekommen jetzt
  durchgängig `aria-label`.** Bisher hatten von ~40 `<button>`-Elementen in
  `src/App.jsx` nur 12 Stellen ein `aria-*`/`role`/`alt`-Attribut — reine
  Icon-Buttons (Schließen-Kreuze in den Modals, "Ergebnis entfernen"/"Bild
  entfernen"-Buttons, Hinweis-Ausblenden-Buttons, das Logo im Header, die
  "Speichern"-Buttons für den eigenen API-Key, die während des Speicherns
  nur noch einen Spinner ohne Text zeigen) waren für Screenreader-Nutzer
  ohne zusätzlichen Kontext nicht erkennbar. Gleiches in `AdminPanel.jsx`
  (Schließen-, "Alle als gelesen markieren"-, "Alle löschen"-Button),
  `FeedbackModal.jsx` und `LegalPanel.jsx` (jeweils Schließen-Button).
  Zusätzlich `aria-label` auf den bisher nur über Platzhaltertext
  erkennbaren Eingabefeldern ergänzt (Gemini-API-Key-Inputs in
  `App.jsx`, Feedback-Textarea in `FeedbackModal.jsx`).

## [2.9.2] – 2026-08-26

### Geändert
- **Hauptansicht nutzt auf größeren Screens mehr Breite statt als schmale
  Handy-Spalte zu verharren.** Der Content-Container in `src/App.jsx` war
  hart auf `max-w-sm` (384px) begrenzt, obwohl das README Desktop-Nutzung
  explizit bewirbt ("funktioniert genauso gut am Desktop — etwa im Büro").
  Auf großen Screens blieb dadurch viel ungenutzter Leerraum links/rechts.
  Der Container wächst jetzt stufenweise mit (`max-w-sm` →
  `sm:max-w-xl` → `md:max-w-2xl` → `lg:max-w-3xl`), `main`- und
  Seiten-Padding skalieren mit (`sm:p-6 lg:p-8`), und das
  Berufs-Spezial-Tools-Grid nutzt ab `sm`/`lg` 3 bzw. 4 statt fix 2 Spalten.
  Visuell per Playwright-Screenshots bei 390/640/768/1024/1440px geprüft
  (kein Firebase-Login nötig, da `VITE_FIREBASE_*` in der Testumgebung
  unkonfiguriert war und die App dann direkt die Hauptansicht ohne
  Login-Gate zeigt).

## [2.9.1] – 2026-08-26

### Geändert
- **Historie-, API-Key-Onboarding- und Profil-Modal folgen jetzt dem
  Pergament/Gold-Theme statt generischem Tailwind-Grau/Blau.** Bisher
  brachen diese drei Dialoge (`AnalysisHistoryModal`, `ApiKeyOnboardingModal`,
  `UserProfileModal` in `src/App.jsx`) mit `bg-white`/`shadow-2xl`-Containern,
  `text-blue-600`-Icons und `bg-blue-100 text-blue-800`-Badges aus dem sonst
  durchgängigen Fantasy-/Handwerker-Look aus (`panel-parchment`, Gold-/
  Pergament-Farbtokens aus `src/index.css`, siehe `TRADE_THEMES`-Akzentfarbe
  pro Beruf). Jetzt nutzen alle drei die `panel-parchment`-Klasse als
  Container, Icons/Verlinkungen/Badges laufen über die berufsabhängige
  `--accent`/`--accent-dark`/`--accent-soft`-Variable statt fixem Blau, und
  der "Historie"-Button im Profil-Modal nutzt `btn-parchment` statt
  `bg-blue-600` (der rote "Abmelden"-Button bleibt bewusst Rot als
  Warnfarbe). Zusätzlich `aria-label` auf den bisher unbeschrifteten
  Schließen-Icon-Buttons dieser drei Modals sowie auf dem Profil-Button im
  Header ergänzt.

## [2.9.0] – 2026-08-26

### Hinzugefügt
- **Automatisierte Tests (Vitest) für die sicherheits-/kontingentkritische
  Server-Logik.** Das Projekt hatte bis dahin keinerlei Testabdeckung — kein
  Test-Framework, keine `*.test.js`-Dateien. Am riskantesten war das:
  `api/tts.js` verifiziert Firebase-ID-Tokens komplett manuell (RS256 gegen
  Googles öffentliche Zertifikate, ohne `firebase-admin`), ohne dass ein
  falsch verschobenes `if` (z.B. bei `aud`/`iss`/`exp`) aufgefallen wäre. Jetzt
  deckt `api/tts.test.js` `verifyFirebaseIdToken` gegen abgelaufene/zu junge/
  manipulierte/falsch signierte Tokens, falschen Issuer/Audience und unbekannte
  `kid` ab (Tokens werden dafür mit einem im Test generierten RSA-Schlüsselpaar
  signiert, `crypto.verify` akzeptiert dafür direkt den öffentlichen Schlüssel
  als Ersatz für Googles Zertifikat) sowie `chunkText` (Aufteilung am
  Byte-Limit inkl. korrekter Zählung mehrbyteiger Umlaute). `api/gemini.test.js`
  deckt `checkRateLimit` (Minuten-/Tagesfenster-Reset, Lebenszeit-Demo-Kontingent)
  und `checkAndConsumeTrial` (Pro-Konto-Kontingent aus `FREE_TRIAL_MAX`) ab —
  beides über eine In-Memory-Fake-Implementierung von
  `firebase-admin/firestore` (`collection`/`doc`/`runTransaction`), ohne echtes
  Firestore-Projekt. Dafür wurden `checkRateLimit`, `checkAndConsumeTrial`
  (`api/gemini.js`) sowie `verifyFirebaseIdToken`, `checkRateLimit`,
  `checkPremiumQuota`, `chunkText` (`api/tts.js`) exportiert (rein additiv,
  keine Verhaltensänderung). Neue Scripts `npm test` (einmaliger Lauf) und
  `npm run test:watch`, Konfiguration in `vitest.config.js`.

## [2.8.1] – 2026-08-26

### Geändert
- **Berufs-Spezial-Tools sitzen jetzt unter dem Analyseergebnis statt
  darüber.** Bisher erschienen die Berufs-Spezial-Tools (`currentTradeTools`
  in `src/App.jsx`) zwischen dem Analyse-Formular ("2. Problem
  dokumentieren & analysieren") und dem Ergebnis-Abschnitt ("3. Ergebnis
  der KI-Analyse") — wer erst die KI-Diagnose sehen wollte, musste daran
  vorbeiscrollen. Die Sektion wurde unverändert (inkl. ihrer Ergebnisliste
  und dem bedingten PDF-Export-Button) hinter den KI-Analyse-Abschnitt
  verschoben, sodass die Reihenfolge jetzt Formular → KI-Analyse →
  Spezial-Tools lautet.

## [2.8.0] – 2026-08-26

### Hinzugefügt
- **Geführte Anleitung zum Hinterlegen eines eigenen API-Keys.** Bisher zeigte
  ein aufgebrauchtes Pro-Konto-Kontingent (siehe V2.7.0) nur eine Fehlermeldung
  im roten Hinweisfeld — der Nutzer musste selbst wissen, dass dafür das
  Profil-Menü der richtige Ort ist. Jetzt öffnet sich bei jedem mit Status 402
  scheiternden KI-Aufruf automatisch ein neuer Dialog (`ApiKeyOnboardingModal`
  in `src/App.jsx`, ausgelöst über die neue `handleTrialExceededError`), der in
  4 Schritten durch das Erstellen eines eigenen, kostenlosen Gemini-API-Keys
  bei Google AI Studio führt (Link öffnet direkt `aistudio.google.com/apikey`)
  und den erzeugten Key direkt im selben Dialog entgegennimmt und speichert —
  ohne Umweg über das Profil-Menü. Nach dem Speichern kann die zuvor
  fehlgeschlagene Aktion sofort erneut gestartet werden.

## [2.7.0] – 2026-08-26

### Hinzugefügt
- **Rollout-Kostenmodell: 20 kostenlose Analysen pro Konto, danach eigener
  Gemini-API-Key.** Bisher lief jede KI-Anfrage über einen einzigen
  zentralen `GEMINI_API_KEY`, geschützt nur durch ein IP-weites
  Lebenszeit-Kontingent (`DEMO_LIFETIME_MAX`, gedacht für den anonymen
  Demo-Link) — bei echtem Rollout an mehrere Nutzer hätte das entweder
  unbegrenzte Kosten auf den eigenen Account bedeutet oder mehrere Nutzer
  hinter derselben IP/demselben Firmennetz gegenseitig blockiert. Jetzt
  zählt `api/gemini.js` Haupt-Diagnosen pro Konto (Firestore
  `_analysisQuota/{uid}`, per verifiziertem Firebase-ID-Token, neue
  Konstante `FREE_TRIAL_MAX` in `shared/trialLimit.js`, Stand: 20). Ist das
  Kontingent aufgebraucht, nutzt der Server automatisch einen vom Nutzer
  selbst im Profil hinterlegten Gemini-API-Key (`UserProfileModal` in
  `src/App.jsx`, neues Feld `geminiApiKey` im Firestore-Profil) statt des
  zentralen Keys — die Kosten laufen dann über das eigene Google-Konto der
  Person. Ohne hinterlegten Key liefert der Server einen klaren 402-Fehler
  mit Hinweis statt eines generischen "später erneut versuchen". Ein neuer
  Endpoint `api/trial-status.js` (Zwilling zu `api/demo-status.js`, aber
  pro Konto statt pro IP) zeigt den aktuellen Stand schon beim App-Start.
  Das alte IP-basierte `DEMO_LIFETIME_MAX`-Kontingent bleibt als Schutz für
  Anfragen ohne gültiges Login bestehen (z. B. ein Direktzugriff auf den
  Endpoint am UI vorbei); das Burst-/Tages-Fenster pro IP (12/Minute,
  200/Tag) gilt weiterhin für alle, auch eingeloggte Nutzer.
>>>>>>> origin/master

## [2.6.0] – 2026-08-24

### Geändert
- **Berufs-Spezial-Tool-Ergebnisse verschwinden nicht mehr beim
  Berufswechsel.** Bisher zeigte die Ergebnisliste nur Tool-Ergebnisse des
  aktuell gewählten Berufs (`currentTradeTools`) — ein Ergebnis, das z.B.
  bei "Zimmerer" erzeugt wurde, verschwand aus der Ansicht, sobald auf
  "Klempner" gewechselt wurde (blieb aber im State erhalten, war nur nicht
  mehr sichtbar). Jetzt sammelt eine neue `tradeToolResultEntries`-Liste
  (`src/App.jsx`) Ergebnisse über ALLE Berufe hinweg — Ergebnisse
  verschiedener Berufe stapeln sich, man kann völlig flexibel zwischen
  Berufen wechseln und weitere Tools ausführen, ohne bisherige Ergebnisse
  zu verlieren. Jede Ergebniskarte zeigt Akzentfarbe und (falls vom aktuell
  gewählten Beruf abweichend) ein kleines Herkunfts-Label des
  ursprünglichen Berufs. Der PDF-Export (`handleExportPdf`) exportiert
  entsprechend jetzt auch gestapelte Ergebnisse mehrerer Berufe statt nur
  die des aktuell gewählten.

## [2.5.0] – 2026-08-24

### Hinzugefügt
- **Ergebnisse der generischen KI-Tools einzeln per (X) entfernbar.**
  Analog zu den Berufs-Spezial-Tools (V2.3.0) bekommen jetzt auch
  Materialliste, Sicherheits-Check, Video-Anleitungen und Kundenbericht
  (`src/App.jsx`) je einen (X)-Button oben rechts, der nur das jeweilige
  Ergebnis entfernt (`setMaterialList`/`setSafetyTips`/`setVideoLinks`/
  `setClientReport` auf `null`) — erneuter Klick auf das Tool erzeugt es
  bei Bedarf neu.

## [2.4.0] – 2026-08-24

### Hinzugefügt
- **PDF-Export bereits mit nur einem Berufs-Spezial-Tool-Ergebnis möglich,
  ohne abgeschlossene Diagnose.** `handleExportPdf` (`src/App.jsx`) setzte
  bisher zwingend `solutionText` voraus, obwohl die Berufs-Spezial-Tools
  seit V2.0.0 schon vor einer Diagnose nutzbar sind und ihre Ergebnisse im
  Export ohnehin schon mit ausgegeben wurden (Abschnitt 7). Der Export
  prüft jetzt, ob Diagnose ODER mindestens ein Tool-Ergebnis vorliegt; der
  Diagnose-Abschnitt im PDF erscheint nur noch, wenn tatsächlich eine
  Diagnose existiert. Ein eigener "Als PDF exportieren"-Button erscheint
  direkt im Berufs-Spezial-Tools-Bereich, solange noch keine Diagnose
  läuft (der bestehende Button im Analyseergebnis-Bereich deckt den Fall
  mit Diagnose weiterhin ab, kein doppelter Button).

## [2.3.0] – 2026-08-24

### Hinzugefügt
- **Ergebnisse der Berufs-Spezial-Tools einzeln per (X) entfernbar.** Jede
  Tool-Ausgabe hatte bisher keine Möglichkeit, sie wieder auszublenden —
  bei mehreren genutzten Tools bläht das die Ergebnisansicht unnötig auf.
  Jede Ergebniskarte (`src/App.jsx`) hat jetzt einen (X)-Button oben rechts,
  der nur das jeweilige Ergebnis aus `tradeToolResults` entfernt (erneuter
  Klick auf das Tool erzeugt es bei Bedarf neu).

## [2.2.3] – 2026-08-24

### Behoben
- **`FUNCTION_INVOCATION_TIMEOUT` bei `/api/gemini`-Aufrufen.** Direkt gegen
  die Gemini-API getestet: `gemini-flash-latest` hing komplett (0 Bytes nach
  40-60s, auch bei trivialen Prompts), das aktuell empfohlene
  Nachfolgemodell `gemini-3.6-flash` ist ein "Thinking"-Modell mit ~24s
  allein für "Hallo" — zu langsam für die 30s `maxDuration` in
  `api/gemini.js`, sobald App-Check/Firestore-Overhead dazukommt. Auf
  `gemini-flash-lite-latest` umgestellt (0-3s Antwortzeit im Test, gleiche
  Qualität, weiterhin ein automatisch aktueller "-latest"-Alias). Siehe
  `error_log.md` Eintrag 10.

## [2.2.2] – 2026-08-24

### Geändert
- **Berufs-Spezial-Tools jetzt direkt oberhalb des Analyseergebnisses statt
  zwischen Berufsauswahl und Problemdokumentation.** Bisher (seit V2.0.0)
  saß der Abschnitt zwischen "1. Beruf auswählen" und "2. Problem
  dokumentieren & analysieren". Neu: Der Abschnitt sitzt direkt vor
  "3. Ergebnis der KI-Analyse" (`src/App.jsx`) — weiterhin sofort nutzbar
  ohne abgeschlossene Diagnose, nur die Position im Seitenfluss hat sich
  geändert.

## [2.2.1] – 2026-08-22

### Geändert
- **Markenname groß auf dem Login-Gate.** Seit dem verpflichtenden
  Google-Login (V2.2.0) ist der erste Bildschirm, den Nutzer sehen, das
  Login-Gate — dort fehlte bisher jede Markenkennzeichnung. Jetzt erscheint
  "Sm@rtCraft" groß mit der Versionsnummer klein darunter, oberhalb von
  "Mit Google anmelden" (`App.jsx`).

## [2.2.0] – 2026-08-22

### Geändert
- **Google-Login ist jetzt verpflichtend.** Bisher startete die App beim
  ersten Öffnen automatisch eine anonyme Firebase-Sitzung (Gast-Modus) und
  eine Google-Anmeldung war nur optional über das Profil-Menü verfügbar. Neu:
  Ohne Google-Anmeldung ist die App nicht nutzbar — `App.jsx` zeigt statt der
  Hauptansicht ein Login-Gate mit "Mit Google anmelden"-Button, solange kein
  per Google authentifizierter Nutzer vorliegt. Die zugehörige "Gast-Sitzung
  auf diesem Gerät gefunden"-Bestätigung (Weiter als Gast / Neue Sitzung
  starten) sowie die automatische Neu-Anmeldung als Gast nach dem Abmelden
  entfallen dadurch ersatzlos. Eine bereits vor diesem Update im Browser
  bestehende anonyme Alt-Sitzung wird beim ersten Google-Login weiterhin per
  Firebase-Account-Linking übernommen, sodass ihre Historie nicht verloren
  geht. Premium-Sprachausgabe (Google Cloud TTS) läuft dadurch jetzt immer,
  ohne separate Fallback-Logik für nicht angemeldete Nutzer. Impressum/
  Datenschutz (`LegalPanel.jsx`) entsprechend angepasst.

## [2.1.1] – 2026-08-22

### Geändert
- **Kopfleiste aufgeräumt/poliert statt "used".** Die mit dem Blau-Umstieg
  (V2.1.0) mitgewanderten Rost-/Ölfleck-Texturen, Kratzer und der
  ausgefranste Rand am unteren Header-Rand wirkten nicht mehr stimmig zum
  sauberen Blauton. `HeaderPlate` (`src/App.jsx`) zeigt jetzt nur noch einen
  dezenten diagonalen Glanzstreifen plus eine gerade Akzentlinie an der
  Unterkante.

## [2.1.0] – 2026-08-22

### Geändert
- **Farbschema auf Blau umgestellt.** Die bisherige Gold/Wein-Rot-Ornament-
  Identität (Kopfleiste inkl. Rost-/Grunge-Textur, Rahmen, Buttons, Logo-Blitz,
  Favicon) läuft jetzt in Blautönen statt Gold/Wein-Rot — Textur-Technik
  (Verwitterung, Kratzer, Glanzstreifen) und Pergament-Panel-Hintergrund
  bleiben, nur die Farbwerte ändern sich. Die 9 Berufs-Akzentfarben
  (`src/App.jsx`) sind ebenfalls auf unterscheidbare Blau-Varianten
  umgestellt. Die generische Vier-Tools-Farbcodierung (Indigo/Teal/Amber)
  bleibt bewusst unverändert, da sie einzelne Aktionen unterscheidet statt
  Marken-Identität abzubilden.

## [2.0.0] – 2026-08-22

Start des Projekt-Ordners `SmartCraft-V2` als eigenständige Kopie von
`SmartCraft` (Stand V1.37.1) — die ursprüngliche Version bleibt in ihrem
eigenen Ordner/Deployment unverändert bestehen.

### Geändert
- **Berufs-Spezial-Tools sofort nach Berufswahl klickbar, ohne Diagnose.**
  Bisher (V1.37.0/.1) saßen die Berufs-Spezial-Tools als Reiter innerhalb der
  "Zusätzliche KI-Tools" und waren wie diese erst nach einer abgeschlossenen
  Analyse (`solutionText`) nutzbar. Neu: Ein eigener, immer sichtbarer
  Abschnitt direkt unter der Berufsauswahl (vor "2. Problem dokumentieren")
  zeigt die Tools für den gewählten Beruf, klickbar unmittelbar nach der
  Berufswahl. Jedes Tool nutzt jetzt die konkreteste verfügbare Grundlage —
  abgeschlossene Diagnose > eingegebene Problembeschreibung > nur den
  gewählten Beruf (`buildTradeToolQuery` in `src/App.jsx`) — statt zwingend
  eine Diagnose vorauszusetzen. Die "Zusätzliche KI-Tools" nach der Analyse
  zeigen dadurch keinen Reiter mehr, nur noch die vier generischen Werkzeuge
  (Materialliste, Sicherheits-Check, Video-Anleitung, Kundenbericht), die
  weiterhin eine Diagnose voraussetzen.

## [1.37.1] – 2026-08-22

### Geändert
- **Regression "Gewerk"/"Gewerbe" statt "Beruf" behoben.** Die neuen
  Berufs-Spezial-KI-Tools aus V1.37.0 hatten in Reiter-Label, PDF-Export-
  Überschrift, Code-Kommentaren, README und CHANGELOG versehentlich wieder
  "Gewerk"/"Gewerbe" verwendet — der seit V1.24.3 geltende UI-Begriff ist
  "Beruf". Zusätzlich ein seit V1.24.3 übersehenes "Gewerk" in den
  Datenschutztexten (`LegalPanel.jsx`) korrigiert.

## [1.37.0] – 2026-08-22

### Hinzugefügt
- **Berufs-spezifische KI-Tools.** Neben den vier generischen "Zusätzliche
  KI-Tools" (Materialliste, Sicherheits-Check, Video-Anleitung,
  Kundenbericht) gibt es jetzt pro Beruf zwei zusätzliche KI-Tools, die im
  Ergebnisbereich in einem eigenen Reiter ("<Beruf>-Spezial", markiert mit
  einem Sparkle-Icon) neben "Allgemein" erscheinen — z.B. beim Klempner ein
  Trinkwasserverordnung-Check und ein Normteile-Finder, beim Elektriker ein
  VDE-Vorschriften-Check und ein Sicherungs-/Querschnitt-Rechner (volle
  Liste in `TRADE_TOOLS`, `src/App.jsx`). Bei "Allround-Handwerker" zeigt der
  Reiter die Vereinigung aller Berufs-Tools (16 insgesamt). Eine einzige
  generische `callGeminiTradeToolAPI`-Funktion ruft alle Tools auf statt
  einer eigenen Funktion pro Tool, um die bestehende Fetch-/
  Fehlerbehandlung nicht 16-fach zu duplizieren. Ergebnisse fließen auch in
  den PDF-Export (`handleExportPdf`) ein.

## [1.36.0] – 2026-08-21

### Hinzugefügt
- **Browser-Tab-Icon (Favicon).** Die App hatte bisher gar kein Favicon,
  Browser-Tabs zeigten nur das Standard-Icon. Neu ist `public/favicon.svg`
  (in `index.html` per `<link rel="icon" type="image/svg+xml">`
  eingebunden) — ein rundes Badge im Header-Look (Weinrot-Verlauf, Gold-Ring)
  mit dem gleichen Hammer+Blitz-Motiv wie das Logo in der Kopfleiste
  (`SmarterCraftLogo` in `src/App.jsx`).

## [1.35.0] – 2026-08-20

### Hinzugefügt
- **Baustellen-"used"-Look für die Kopfleiste.** Der Header hat jetzt statt
  einer geraden Goldlinie einen ausgefransten/kaputten Goldrand sowie
  Rost-, Ölflecken, Kratzer und einen dezenten Glanzstreifen als
  SVG-Overlay (`HeaderPlate` in `src/App.jsx`). Das Overlay legt sich rein
  dekorativ über den bestehenden `.header-ornate`-Hintergrund
  (`src/index.css`), sodass an keiner Stelle Transparenz durchscheint,
  unabhängig von Bildschirmbreite/-höhe.

## [1.34.2] – 2026-08-19

### Geändert
- **App-Start-Log zählt jetzt auch eigene Admin-Aufrufe.** Die in V1.30.0
  eingeführte Ausnahme (Admin-Konto wurde weder client- noch serverseitig
  geloggt) fiel bei einem echten Admin-Testbesuch auf: Statt eines geloggten
  Starts mit ID fehlte der Eintrag komplett, was wie der in V1.34.1 gefixte
  visitorId-Bug aussah. Client (`logAppStartOnce` in `src/App.jsx`) und
  Server (`api/app-start.js`, `verifyVisitor`/`isAdmin`-Skip) prüfen jetzt
  nicht mehr, ob der Aufrufer Admin ist — jeder App-Start wird geloggt, auch
  vom eigenen Admin-Konto.

## [1.34.1] – 2026-08-19

### Behoben
- **App-Start-Log ohne ID bei brandneuer anonymer Sitzung.** Bei einem
  Browser ganz ohne vorherige Firebase-Sitzung feuerte `logAppStartOnce()`
  (`src/App.jsx`) den App-Start-Log-Aufruf sofort, bevor
  `signInAnonymously()` überhaupt einen `currentUser` angelegt hatte —
  `fetchWithRetry` konnte deshalb kein ID-Token anhängen und `api/app-start.js`
  loggte den Eintrag ohne `visitorId`. Da der Log-Aufruf nur einmal pro
  Seiten-Ladevorgang feuert, wurde der Start danach nie mit der neu erzeugten
  UID nachgetragen. Aufruf jetzt so verschoben, dass er in diesem Fall erst im
  Folge-Durchlauf von `onAuthStateChanged` mit dem frisch angelegten anonymen
  User (und damit gültigem Token) passiert; scheitert `signInAnonymously()`
  selbst, wird der Start als Fallback weiterhin ohne UID gezählt.

## [1.34.0] – 2026-08-19

### Hinzugefügt
- **Eigene ID im Profil-Modal sichtbar.** Beim Klick auf das Profilbild im
  Header sieht man jetzt die eigene Kurz-ID (erste 6 Zeichen der Firebase-
  Anmelde-UID, gleiches Format wie im Admin-App-Start-Log), sowohl im
  angemeldeten Google-Zweig (`src/App.jsx`, neu unter Name/E-Mail) als auch
  im anonymen Zweig, wo die bisherige volle "Temporäre ID" nun zusätzlich um
  die Kurzform ergänzt ist. Funktioniert unabhängig vom Anmeldestatus, da
  `userId` in beiden Fällen die gleiche Firebase-UID ist.

## [1.33.1] – 2026-08-18

### Geändert
- **Feedback-Button auffälliger platziert.** Der in V1.33.0 eingeführte
  Button ging als unscheinbarer Text-Link neben "Impressum & Datenschutz"
  im Footer unter. Jetzt ein freischwebender, goldener Pill-Button
  (`.btn-gold`, neu in `src/index.css`) unten rechts, immer sichtbar
  unabhängig vom Scroll-Stand — bewusst Gold statt des grünen `btn-quest`,
  damit er nicht mit dem primären "Problem analysieren"-CTA verwechselt
  wird.

## [1.33.0] – 2026-08-18

### Hinzugefügt
- **"Feedback senden"-Button direkt in der App.** Neuer Footer-Button neben
  "Impressum & Datenschutz" öffnet `src/FeedbackModal.jsx` (Textarea, max.
  2000 Zeichen) und schickt die Nachricht über die neue, serverseitige
  `api/send-feedback.js` per Mail an den Support — gleiches Schutzmuster
  (Same-Origin-Check, Firebase App Check, IP-Rate-Limit, Resend) wie
  `api/report-bug.js`, aber eigener Rate-Limit-Zähler und ohne
  Firestore-Speicherung oder Dedup, da jede Nachricht ein bewusster,
  eigenständiger Nutzer-Klick ist. Client-seitig teilt sich
  `sendFeedback()` (`src/errorReporting.js`) den bestehenden
  App-Check-Instanz-Verweis mit `sendBugReportEmail()`. Bei Anmeldung per
  Google-Konto wird die Nachricht zusätzlich mit Name/E-Mail versehen.
  Datenschutzerklärung (`src/LegalPanel.jsx`) um einen entsprechenden
  Abschnitt ergänzt.

## [1.32.0] – 2026-08-18

### Hinzugefügt
- **"Als gelesen markieren" und "Alle löschen" für das App-Start-Log im
  Admin-Bereich.** Zwei Icon-Buttons über der App-Starts-Liste in
  `src/AdminPanel.jsx`: Der Augen-Button merkt sich einen einzelnen
  Zeitstempel (`artifacts/{appId}/adminMeta/appStartsReview`, wie die
  bestehenden `adminMeta`-Dokumente per Custom Claim geschützt) statt pro
  Eintrag — neue Starts seitdem zeigen einen blauen Punkt. Der
  Papierkorb-Button löscht nach Bestätigung alle App-Start-Log-Einträge in
  500er-Batches (`deleteAllAppStarts` in `src/errorReporting.js`).
  `firestore.rules` erlaubt Admin-Konten dafür jetzt zusätzlich `delete` auf
  `appStarts` (weiterhin kein `create`/`update` — neue Einträge entstehen
  unverändert nur serverseitig über `api/app-start.js`).

## [1.31.0] – 2026-08-18

### Hinzugefügt
- **Impressum & Datenschutzerklärung.** Neue `src/LegalPanel.jsx`, aufrufbar
  über einen neuen Footer-Link in `src/App.jsx` (kein Router im Projekt,
  daher als Modal statt eigener Route). Deckt alle tatsächlich verwendeten
  Datenverarbeitungen ab: Vercel-Hosting, Firebase Authentication (anonym +
  Google), Firestore-Verlauf, Gemini-API (inkl. optional übermitteltem Foto
  der Problemstelle — beim ersten Entwurf fälschlich als "nur Text"
  beschrieben, beim Review anhand von `App.jsx`/`api/gemini.js` korrigiert),
  Google Cloud TTS, Fehlerreports, das neue App-Start-Log (inkl. `visitorId`),
  IP-basierter Missbrauchsschutz und App Check/reCAPTCHA. Enthält einen
  Hinweis, dass es sich um einen Entwurf ohne Rechtsberatung handelt.

## [1.30.0] – 2026-08-18

### Hinzugefügt
- **App-Start-Log: eigene Admin-Aufrufe ausgeschlossen, pseudonyme
  Geräte-Wiedererkennung ergänzt.** `src/App.jsx` verschiebt den
  App-Start-Ping in den `onAuthStateChanged`-Callback und zählt nur noch, wenn
  der (ggf. automatisch wiederhergestellte) Nutzer keinen Admin-Claim trägt
  (`logAppStartOnce`) — vorher wurden auch eigene Test-/Admin-Aufrufe
  mitgezählt. `api/app-start.js` verifiziert dazu optional ein
  Firebase-ID-Token (`Authorization: Bearer …`) und lehnt Admin-Aufrufe
  zusätzlich serverseitig ab (Defense-in-Depth). Aus demselben Token wird bei
  Erfolg die anonyme Firebase-UID als `visitorId` mitgeloggt — dieselbe UID,
  die für die Verlaufs-Funktion ohnehin existiert, keine neue Kennung —, damit
  wiederkehrende Geräte am selben Ort unterscheidbar sind, ohne Name/E-Mail.
  `firestore.rules`-Kommentar und README entsprechend ergänzt.

## [1.29.1] – 2026-08-18

### Geändert
- **App-Start-Log auf einzelne Einträge mit exaktem Zeitstempel umgestellt**
  (V1.29.0 hatte nur ein Tages-Aggregat pro Region geschrieben — dabei gingen
  Uhrzeit und die Trennung einzelner Starts verloren, siehe Rückmeldung nach
  dem ersten Test). `api/app-start.js` legt jetzt pro Start ein Dokument in
  `artifacts/{appId}/appStarts` an (`timestamp`, `country`, `city`), weiterhin
  ohne Login/UID und ohne IP-Speicherung. `firestore.rules` und
  `src/AdminPanel.jsx` (jetzt eine Liste der letzten 300 Starts statt der
  Tages-Übersicht) entsprechend angepasst. Neuer Hinweis in der README: da die
  Collection jetzt unbegrenzt wächst, sollte bei nennenswertem Nutzeraufkommen
  eine Firestore-TTL-Policy auf `timestamp` eingerichtet werden.

## [1.29.0] – 2026-08-18

### Hinzugefügt
- **DSGVO-schonender App-Start-Zähler für den Admin-Bereich.** Neuer
  Endpoint `api/app-start.js` erhöht bei jedem App-Start serverseitig nur
  ein Tages-Aggregat (`artifacts/{appId}/appStartsDaily/{datum}`) mit
  Gesamtzahl + grober Region (Land/Stadt aus Vercels `x-vercel-ip-*`-Headern,
  ohne IP-Speicherung) — bewusst kein Log einzelner Starts mit Zeitstempel
  pro Person, um keinen unnötigen Personenbezug zu schaffen. Gleiches
  Same-Origin-/App-Check-/Rate-Limiting-Muster wie `api/report-bug.js`.
  `src/AdminPanel.jsx` zeigt die letzten 14 Tage kompakt an. Neue
  `firestore.rules`-Regel erlaubt Lesezugriff auf `appStartsDaily` nur für
  Admin-Konten (Custom Claim `admin: true`), Schreiben erfolgt ausschließlich
  serverseitig über den Firebase-Admin-SDK. **Hinweis:** Der Zähler ersetzt
  keine Datenschutzerklärung — bevor die App produktiv mit echten Nutzern
  läuft, muss dieses (und ähnliche) Datenverarbeitungen dort dokumentiert
  werden; aktuell existiert im Projekt noch keine.

## [1.28.0] – 2026-08-16

### Geändert
- **Neues "Look and Feel" angelehnt an ornamentale Game-UI-Ästhetik**
  (Vorlage: Tages-Login-Screen eines Mobile-Games mit Pergament-Panels,
  weinroter Kopfleiste mit Goldsaum und grünen Pillen-Buttons/-Badges).
  `src/index.css` bekam ein Tailwind-v4-`@theme` mit den neuen Farbtokens
  `parchment`, `wood`, `gold` und `forest` sowie die Komponentenklassen
  `panel-parchment`, `header-ornate`, `badge-pill`, `btn-quest` und
  `btn-parchment`; dazu die Display-Schriftart "Cinzel" (`index.html`).
  In `src/App.jsx` angewendet auf Kopfleiste, Haupt-Panel,
  Abschnittsüberschriften (jetzt grüne Pillen statt schlichter
  `<h2>`-Unterstrichen), die Berufs-Auswahl-Kachel, die
  Problem-Dokumentations-Karte, den Analyse-/Zurücksetzen-Button-Bereich
  sowie den Leer-Zustand des Analyseergebnisses. Bewusst unverändert
  gelassen: die pro Beruf unterschiedlichen Akzentfarben aus
  `TRADE_THEMES` (bleiben funktional bedeutsam) sowie die
  Sicherheits-Hinweisbanner (Demo-Kontingent, EU-AI-Act-Haftungsausschluss)
  — deren neutrale Blau-/Rot-Warnfarben sollen nicht durch ein
  Spiel-Design-Motiv verwässert werden.

## [1.27.4] – 2026-08-16

### Behoben
- **Fünf von sechs `/api/gemini`-Aufrufern zeigten den rohen, englischen
  Google-Fehlertext direkt an.** Bei einem Quota-Fehler ("You exceeded your
  current quota, please check your plan and billing details...") landete
  dieser Text unverändert in der Nutzer-Fehlermeldung — irreführend, da der
  Hinweis auf "plan and billing" nur das Google-Cloud-Projekt des Betreibers
  betrifft (siehe `error_log.md`, Eintrag 5), nicht den App-Nutzer.
  Hauptanalyse, Materialien, Sicherheit, Kundenbericht und Video-Suche
  (`src/App.jsx`) hängten `e.message` direkt an einen deutschen Präfix an;
  nur die TTS-Kurzfassung zeigte bereits vorher eine feste, verständliche
  Meldung. Alle fünf jetzt auf feste deutsche Texte umgestellt, der volle
  Originalfehler bleibt über `queueErrorReport()` weiterhin im Admin-Bereich
  sichtbar. Behebt nicht die zugrunde liegende Quota-Ursache — dafür muss
  Billing für das Google-Cloud-Projekt aktiviert werden.

## [1.27.3] – 2026-08-16

### Behoben
- **Gemini-Überlastungsfehler ("model is currently experiencing high
  demand") führten zu schnell zu einer Fehlermeldung.** `fetchWithRetry` in
  `src/App.jsx` wiederholte 5xx-Antworten bisher nur 3× mit Backoff bis
  max. 4s (Gesamtwartezeit ~3s) — bei einer Google-seitigen Überlastspitze
  reichte das oft nicht, ein manueller erneuter Klick kurz danach
  funktionierte dagegen zuverlässig. `maxRetries` auf 5 erhöht und der
  Backoff auf 8s gedeckelt (Gesamtwartezeit vor dem letzten Versuch jetzt
  ~15s statt ~3s), sodass sich solche kurzfristigen Überlastungen jetzt
  automatisch ausretryen, bevor die App einen Fehler anzeigt.

## [1.27.2] – 2026-08-16

### Behoben
- **README-Hinweis zu fehlendem `RESEND_API_KEY` war veraltet.** Ein Blick in
  die tatsächliche Vercel-Konfiguration (`vercel env ls production`) zeigt:
  `RESEND_API_KEY` ist gesetzt (seit ca. 19h), ebenso `SUPPORT_EMAIL`/
  `VITE_ADMIN_EMAIL` als Empfänger — die Mail-Benachrichtigung bei
  Fehlerreports ist also bereits aktiv, README behauptete fälschlich das
  Gegenteil. Korrigiert und um einen Hinweis ergänzt: `RESEND_FROM_EMAIL`
  ist nicht gesetzt, Versand läuft dadurch über Resends Sandbox-Absender
  `onboarding@resend.dev`, der laut Resend nur an die beim Resend-Konto
  hinterlegte Signup-Adresse zustellen darf — falls Reports trotz aktiver
  Konfiguration nicht ankommen, ist das der erste Verdächtige.

## [1.27.1] – 2026-08-16

### Behoben
- **Fehlerreporting hatte mehrere stille Lücken — unerwartete Fehler kamen
  nicht mehr zuverlässig im Admin-Bereich/per Mail an, unabhängig vom Gerät.**
  - `google-tts-api`- und `gemini-tts-summary-api`-Fehler nutzten Kontexte,
    die nicht in `ERROR_CONTEXT_INFO` (`src/errorContextInfo.js`) registriert
    waren. Das Mail-Dedup in `api/report-bug.js` bucketet unbekannte Kontexte
    gemeinsam unter `_unrecognized` (siehe V1.26.5) — reale Fehler dieser
    beiden Kontexte konnten dadurch von einem beliebigen anderen unbekannten
    Fehler "verdeckt" werden und nie eine eigene Mail auslösen. Ergänzt,
    zusammen mit den ebenfalls unregistrierten `app-check-init` und
    `firebase-auth-fresh-session`.
  - Der in V1.27.0 eingeführte Fallback auf Browser-TTS unterschied
    fälschlich anhand des rohen HTTP-Status (`e.cause !== 429`), ob ein
    Premium-TTS-Fehler "erwartet" ist. Ein `429` kann aber auch von der
    Google-Cloud-TTS-API selbst kommen (z.B. Billing-/Kontingent-Problem
    dort — dasselbe Fehlerbild wie der offene Gemini-Quota-Fehler in
    `error_log.md`), wurde von `api/tts.js` unverändert durchgereicht und
    wäre dadurch nie gemeldet worden. `api/tts.js` markiert eigene
    429-Antworten jetzt mit `code: 'rate_limited'`/`'quota_exceeded'`;
    `src/App.jsx` prüft in `speakText()` gezielt auf diesen `code` statt auf
    den Status.
  - Mehrere `setError(...)`-Zweige mit echten, unerwarteten Fehlern (keine
    Exception, daher kein Catch-Block) lösten nie einen Report aus: leere/
    unstrukturierte KI-Antworten in allen fünf `/api/gemini`-Aufrufern
    (Hauptanalyse, Materialien, Sicherheit, Kundenbericht, Video-Suche inkl.
    aller drei Fehlerzweige dort), Firestore-Fehler beim Laden der
    Analyse-Historie (neuer Kontext `load-history-api`), Bildverarbeitung
    (`fileToBase64()`, neuer Kontext `image-load`) sowie ein Browser ganz
    ohne Web-Speech-API-Unterstützung (neuer Kontext
    `browser-tts-unsupported`). Reine Bedienhinweise (fehlendes Bild/
    Beschreibung, nichts zum Exportieren, vom Nutzer blockiertes
    Druck-Popup, vom Nutzer abgebrochener Google-Login) bleiben bewusst
    unauffällig, da kein Bug.

## [1.27.0] – 2026-08-16

### Geändert
- **Premium-TTS: Tageskontingent für alle Google-Nutzer statt Einzelkonto,
  garantierter Browser-Fallback statt Fehlermeldung.** Bisher war die
  Premium-Sprachausgabe (Google Cloud TTS, WaveNet) über `ALLOWED_TTS_EMAIL`
  serverseitig auf genau ein Google-Konto beschränkt — jeder andere Nutzer,
  auch angemeldet, bekam nur `403 Forbidden` und keinen Ton. Eine
  browserseitige Fallback-Stimme existierte im Code nicht mehr (früher wegen
  Unzuverlässigkeit entfernt).
  - `api/tts.js` prüft jetzt nur noch, ob das mitgeschickte Firebase-ID-Token
    zu einem echten (nicht-anonymen), e-mail-verifizierten Google-Login
    gehört (`firebase.sign_in_provider !== 'anonymous'`) — jeder angemeldete
    Nutzer qualifiziert sich strukturell. Als Kostenschutz kommt stattdessen
    ein serverseitiges Tageskontingent pro Nutzer (`PREMIUM_TTS_DAILY_MAX =
    15`, `shared/ttsQuota.js`), durchgesetzt per Firestore-Transaktion auf
    `_ttsPremiumQuota/{uid}` (uid aus dem verifizierten Token, nicht vom
    Client). Bei Überschreitung: `429` mit `code: 'quota_exceeded'`.
  - `src/App.jsx`: Nicht angemeldete Nutzer bekommen jetzt direkt die
    browsereigene Web-Speech-API (`speakWithBrowserTts`, per
    `pickBrowserVoice` mit deutscher, geschlechtspassender Stimme) statt
    überhaupt gegen `/api/tts` zu laufen. Angemeldete Nutzer versuchen
    weiterhin zuerst Premium-TTS; schlägt das aus irgendeinem Grund fehl
    (Kontingent voll, Rate-Limit, Server-Fehler, Netzwerkfehler), schaltet
    `speakText()` automatisch und ohne nutzersichtbare Fehlermeldung auf die
    Browser-Stimme um — es gibt jetzt keine Sackgasse ohne Audio mehr.
    Erwartete Ablehnungen (Kontingent/Rate-Limit) lösen keinen
    Admin-Fehlerreport mehr aus, unerwartete Fehler weiterhin schon.

## [1.26.6] – 2026-08-15

### Hinzugefügt
- **Linkvorschau für WhatsApp/Facebook/Twitter beim Teilen des Links.**
  `index.html` hatte bislang keine Open-Graph-/Twitter-Card-Meta-Tags — ein
  geteilter Link zeigte in Chat-Apps nur eine nackte URL ohne Titel, Text
  oder Bild. Ergänzt: `og:title`, `og:description`, `og:image`,
  `twitter:card` sowie eine normale `<meta name="description">`. Das
  Vorschaubild (`public/og-image.png`, 1200×630px) ist ein echter
  Screenshot der App (Kopfbereich + Berufsauswahl, ohne die Hinweis-Banner)
  statt eines gestalteten Logos.

## [1.26.5] – 2026-08-15

### Behoben
- **Mail-Dedup aus V1.26.4 ließ sich durch einen abweichenden `context`-Wert
  umgehen.** Nutzerhinweis: Der Dedup-Key war exakt der vom Client
  gesendete `context`-String, ohne Prüfung gegen die bekannte Kontextliste
  (`ERROR_CONTEXT_INFO`). Jeder mit gültigem App-Check-Token (den die echte
  App ohnehin mitliefert, z.B. über die Browser-Konsole abrufbar) hätte
  `/api/report-bug` mit einem bei jedem Aufruf leicht geänderten `context`
  (z.B. angehängte Zufallszahl) aufrufen können — jeder "neue" String hätte
  wieder als unbenachrichtigt gegolten und eine eigene Mail ausgelöst,
  die Sperre also komplett wirkungslos gemacht. Als Nebeneffekt hätte das
  auch das `notifiedContexts`-Dokument unbegrenzt mit Müll-Einträgen
  wachsen lassen. Lösung: `context` wird jetzt gegen die feste, im Code
  hinterlegte Kontextliste normalisiert — nur bekannte Kontexte bekommen
  einen eigenen Dedup-Slot, alles andere fällt in einen gemeinsamen
  Sammel-Slot (`_unrecognized`), der beliebig variierte Werte auf eine
  einzige Mail begrenzt.

## [1.26.4] – 2026-08-15

### Behoben
- **Wiederholt auftretende Fehler haben bei jedem Vorkommen erneut eine Mail
  ausgelöst.** `queueErrorReport()` rief `sendBugReportEmail()` bislang
  unbedingt bei jedem einzelnen Fehler auf — betraf denselben Fehlerkontext
  (z.B. `google-tts-api`, `gemini-vision-api`) mehrere Nutzer, bevor er
  behoben war, füllte das Support-Postfach mit einer Mail pro Vorkommen statt
  einem einzigen Hinweis. Lösung: `api/report-bug.js` merkt sich pro
  Fehlerkontext in Firestore (`adminMeta/notifiedContexts`), ob dafür schon
  eine Mail raus ist, und überspringt weitere Mails für denselben, noch
  offenen Kontext (der Firestore-Report selbst — sichtbar im Admin-Bereich —
  läuft davon unabhängig weiter). `setContextResolved()` in
  `errorReporting.js` löscht die Markierung, sobald ein Kontext im
  Admin-Bereich als "gelöst" markiert wird — taucht der Fehler danach erneut
  auf, gilt das als Regression und alarmiert wieder per Mail. Die
  Firestore-App-ID (`appId`) wurde dafür nach `shared/appId.js` ausgelagert
  (Single Source of Truth für `src/App.jsx` und `api/report-bug.js`).

## [1.26.3] – 2026-08-15

### Behoben
- **KI-Fehlermeldungen zeigten teils nur "[object Object]".** Gemeldet über
  den Admin-Bereich (Kontext `gemini-vision-api`, siehe `error_log.md`).
  `api/gemini.js` reicht Gemini-eigene Fehlerantworten unverändert durch —
  Googles API-Fehlerformat liefert `error` dort als Objekt
  (`{code, message, status}`), während eigene Server-Fehler `error` als
  String liefern. Der Client behandelte beide Fälle bisher gleich und übergab
  das Objekt direkt an `new Error(...)`, was JS automatisch zu
  "[object Object]" stringifiziert — der eigentliche Gemini-Fehlertext ging
  verloren. Betraf alle sechs `/api/gemini`-Aufrufstellen (Hauptanalyse,
  Materialliste, Sicherheitshinweise, Kundenbericht, Video-Suche,
  TTS-Kurzfassung) gleichermaßen. Ein neuer gemeinsamer Helfer
  `extractApiErrorMessage()` unterscheidet jetzt String- und Objekt-Fehler
  (nutzt bei Objekten `.message`) und ersetzt die zuvor sechsfach
  duplizierte, fehleranfällige Extraktion.

## [1.26.2] – 2026-08-15

### Behoben
- **Sprachausgabe (TTS) scheiterte durchgängig mit "Forbidden: invalid App
  Check token".** Gemeldet über den Admin-Bereich (Kontext `google-tts-api`,
  siehe `error_log.md`). `fetchWithRetry` hängte den
  `X-Firebase-AppCheck`-Header bislang nur für `/api/gemini` und
  `/api/demo-status` an — `/api/tts` fehlte in dieser Bedingung, obwohl
  `api/tts.js` denselben Header zwingend voraussetzt, sobald App Check
  serverseitig aktiv ist. Jede TTS-Anfrage scheiterte dadurch strukturell mit
  401, unabhängig vom autorisierten Konto. `apiTtsUrl` ist jetzt Teil der
  Bedingung.

## [1.26.1] – 2026-08-15

### Behoben
- **Google-Anmeldung verlangte bei jedem Login zwei Popups.** Sobald ein
  Google-Konto einmal per `linkWithPopup` mit einer echten UID verknüpft
  wurde, kann es nie wieder mit einer anderen (neuen anonymen) Sitzung
  verknüpft werden — jede künftige Anmeldung startete deshalb zwangsläufig
  mit einem `auth/credential-already-in-use`-Fehler, den der Code bisher mit
  einem zweiten, kompletten `signInWithPopup`-Durchlauf auffing. Für
  wiederkehrende Google-Nutzer (z.B. den neuen Admin-Zugang, siehe V1.26.0)
  bedeutete das strukturell bei jeder Anmeldung zwei Google-Fenster
  nacheinander. Lösung: Das im ersten (fehlgeschlagenen) Link-Versuch
  bereits erteilte OAuth-Credential wird jetzt per
  `GoogleAuthProvider.credentialFromError()` ausgelesen und direkt mit
  `signInWithCredential()` zur Anmeldung verwendet — kein zweites Popup mehr
  nötig. `signInWithPopup` bleibt nur als Fallback, falls Firebase
  ausnahmsweise kein Credential mitliefert.

## [1.26.0] – 2026-08-15

### Hinzugefügt
- **Echter Admin-Zugang statt PIN.** Problem: Der Admin-Bereich
  (`AdminPanel.jsx`) war bislang nur durch einen `VITE_ADMIN_PIN` im
  Client-Bundle geschützt — reiner UI-Sichtschutz, kein echter
  Zugriffsschutz (siehe Kommentar in der alten `firestore.rules`), und ein
  eigenes Konto konnte das Demo-Kontingent in `api/gemini.js` nicht umgehen.
  Lösung: Ein Firebase Custom Claim (`admin: true`) wird per neuem,
  einmalig lokal auszuführendem Skript (`scripts/set-admin-claim.mjs`) auf
  ein bestehendes Konto vergeben — landet nirgends im Code oder Repo.
  `api/gemini.js` verifiziert bei jeder Anfrage das mitgeschickte
  Firebase-ID-Token und liest den Claim serverseitig aus (`isAdminRequest`);
  bei `admin: true` werden IP-Rate-Limit und Demo-Lifetime-Kontingent
  komplett übersprungen. `AdminPanel.jsx` prüft denselben Claim (über
  `getIdTokenResult`) statt eines PIN-Formulars, und `firestore.rules`
  setzt den Claim auch für `errorReports`/`adminMeta` durch — Zugriff ist
  jetzt serverseitig erzwungen, nicht nur UI-gated. `VITE_ADMIN_PIN`
  entfällt ersatzlos.

## [1.25.6] – 2026-08-15

### Behoben
- **Rest-Kontingent-Hinweis im Analyseergebnis auf dem Smartphone unsichtbar.**
  Backend liefert den Live-Wert inzwischen korrekt (bestätigt), auf dem Handy
  war unter "Lösung und Diagnose" trotzdem nichts zu sehen. Verdächtigt:
  das negative `-mt-4`-Margin auf der Hinweis-Zeile, das sie zu dicht an die
  Überschrift heranzog und auf schmalen Viewports vermutlich optisch damit
  verschmelzen ließ. Entfernt — die Zeile nutzt jetzt den normalen
  `space-y-6`-Abstand der übrigen Ergebnis-Sektion.

## [1.25.5] – 2026-08-15

### Behoben
- **`maxDuration`-Erhöhung allein löste das 503 bei `/api/gemini` nicht.**
  Nach V1.25.4 trat derselbe plattformseitige 503 (leeres Log, keine eigene
  Fehlermeldung) weiterhin bei jedem Versuch auf, unabhängig vom Timeout.
  Tatsächliche Ursache gefunden: `checkRateLimit()` (die Firestore-
  Transaktion fürs Rate-Limiting) lief **ungeschützt außerhalb jedes
  try/catch** im Handler — anders als der Upstream-Gemini-Aufruf, der schon
  seit Erstversion sauber abgefangen wurde. Ein dort auftretender Fehler
  (Firestore-Transaktion) crashte die gesamte Function unbehandelt, was
  Vercel als generisches 503 ohne jede eigene Log-Zeile ausliefert — daher
  die zuvor völlig leeren `logs`-Arrays in `vercel logs --json`. Lösung: Der
  komplette Handler-Body liegt jetzt in einem try/catch; jeder unerwartete
  Fehler landet als sauberes `500`-JSON mit `console.error`-Log statt eines
  stillen Absturzes — macht die eigentliche Fehlerursache beim nächsten
  Auftreten direkt sichtbar.

## [1.25.4] – 2026-08-15

### Behoben
- **`/api/gemini` schlug nach Aktivierung von App Check regelmäßig mit
  plattformseitigem 503 fehl.** Ursache: Vercels Default-Timeout für
  Serverless Functions liegt bei 10s. Solange App Check/Rate-Limiting
  fail-open (mangels korrekt konfiguriertem `FIREBASE_SERVICE_ACCOUNT_KEY`/
  `VITE_RECAPTCHA_SITE_KEY`) inaktiv liefen, reichte das knapp. Mit aktiver
  App-Check-Verifikation (Netzwerk-Roundtrip zu Firebase) und der
  Firestore-Transaktion fürs Rate-Limiting VOR dem eigentlichen, oft mehrere
  Sekunden dauernden Gemini-Vision-Aufruf wurde das Limit regelmäßig
  gerissen — sichtbar als 503 ohne jede eigene Fehlermeldung im Vercel-Log
  (`vercel logs --json` zeigte den Status, aber ein leeres `logs`-Array).
  Lösung: `export const config = { maxDuration: 30 }` in `api/gemini.js`.
- **`/api/demo-status` lieferte durchgehend 403 statt eines Rest-Stands.**
  Ursache: Der Origin-Check (identisches Muster wie `api/gemini.js`) verlangte
  einen `Origin`-Header — den schicken Browser bei einfachen `GET`-Requests
  ohne Custom-Header aber nicht zuverlässig mit (anders als bei den
  `POST`-Requests an `/api/gemini`, die immer einen Origin-Header mitbringen).
  Lösung: Fällt jetzt zusätzlich auf den `Referer`-Header zurück, bevor eine
  Anfrage als fremd abgelehnt wird.

## [1.25.3] – 2026-08-15

### Behoben
- **App-Check-Token-Fehler waren für den Admin komplett unsichtbar.**
  Problem: Schlägt `getAppCheckToken()` in `fetchWithRetry` fehl (z.B. weil
  die Domain nicht bei reCAPTCHA hinterlegt ist oder die Web-App noch nicht
  in Firebase App Check registriert war), landete das bisher nur per
  `console.error` in der Browser-Konsole — jede nachfolgende
  `/api/gemini`-Anfrage scheiterte danach mit 401, ohne dass im Admin-Bereich
  (`AdminPanel.jsx`) irgendein Hinweis darauf zu sehen war. Lösung: Der
  Fehler wird jetzt zusätzlich per `queueErrorReport('app-check-token', e)`
  erfasst (neuer Kontext in `errorContextInfo.js` mit Ursachen-/Lösungshinweis)
  und landet dadurch wie jeder andere Fehler im Admin Panel und (sofern
  `RESEND_API_KEY` konfiguriert ist) per Mail. **Nebenbefund:** `RESEND_API_KEY`
  ist im aktuellen Vercel-Projekt nicht gesetzt — die automatische
  Mail-Benachrichtigung bei Fehlerreports läuft dadurch aktuell ins Leere
  (Firestore/Admin-Panel-Weg ist davon unabhängig und funktioniert).

## [1.25.2] – 2026-08-15

### Behoben
- **Rest-Kontingent-Hinweis im Analyseergebnis blieb komplett leer.** Ursache:
  Die Zeile aus V1.25.1 wurde nur gerendert, wenn `demoRemaining` bekannt war
  — ohne Fallback für den Fall `null`. In Produktion ist `demoRemaining`
  aber immer `null`, weil `FIREBASE_SERVICE_ACCOUNT_KEY` in den
  Vercel-Projekteinstellungen nicht gesetzt ist (per `vercel env ls`
  bestätigt) und `api/gemini.js`/`api/demo-status.js` das Tracking dadurch
  komplett übersprungen (Fail-open-Verhalten). Lösung: Die Zeile zeigt jetzt
  bei fehlendem Live-Wert ersatzweise die statische Obergrenze statt gar
  nichts. **Wichtiger, eigentlicher Befund:** Ohne `FIREBASE_SERVICE_ACCOUNT_KEY`
  (und `VITE_RECAPTCHA_SITE_KEY`, ebenfalls nicht gesetzt) ist das
  Demo-Kontingent aus `DEMO_LIFETIME_MAX` in Produktion aktuell gar nicht
  durchgesetzt — nur der Origin-Check schützt `/api/gemini` derzeit. Für
  echten Kostenschutz beim öffentlichen Teilen des Links müssen beide
  Variablen noch in den Vercel-Projekteinstellungen ergänzt werden (siehe
  README, Abschnitt "Deployment (Vercel)").

## [1.25.1] – 2026-08-15

### Hinzugefügt
- **Hinweis aufs Demo-Kontingent auch direkt im Analyseergebnis.** Problem:
  Der Live-Zähler aus V1.25.0 aktualisierte sich zwar nach jeder Anfrage,
  stand aber nur im wegklickbaren Banner ganz oben — einmal dismisst oder
  aus dem Blickfeld gescrollt, blieb der neue Rest-Stand nach einer Analyse
  unbemerkt. Lösung: Direkt unter der "Lösung und Diagnose"-Überschrift im
  Analyseergebnis steht jetzt zusätzlich "Noch X von 30 kostenlosen
  KI-Anfragen für dieses Gerät übrig" — erscheint bei jeder abgeschlossenen
  Hauptanalyse neu, unabhängig vom Banner-Status.

## [1.25.0] – 2026-08-15

### Hinzugefügt
- **Live-Zähler fürs Demo-Kontingent statt statischer Zahl.** Problem: Der
  Banner aus V1.24.4 zeigte nur die feste Obergrenze (30) — wie viele
  KI-Anfragen ein Besucher tatsächlich noch übrig hat, blieb unklar, bis eine
  Analyse mit 403 fehlschlug. Lösung: Ein neuer, rein lesender Endpoint
  (`api/demo-status.js`) liest beim App-Start den aktuellen Stand aus
  `_rateLimits/{ip}.lifetimeCount`, ohne ihn zu erhöhen. `api/gemini.js`
  schickt zusätzlich nach jeder Anfrage (Erfolg wie Fehler) den aktuellen
  Rest-Stand als `X-Demo-Remaining`-Header mit. Der Banner zeigt jetzt "Noch
  X von 30 kostenlosen KI-Anfragen übrig" und aktualisiert sich nach jeder
  Analyse/jedem Zusatz-Tool. `DEMO_LIFETIME_MAX` wurde dafür nach
  `shared/demoLimit.js` ausgelagert (Single Source of Truth für
  `api/gemini.js`, `api/demo-status.js` und den Client-Banner), damit die
  angezeigte Obergrenze nie von der serverseitig durchgesetzten abweicht.

## [1.24.4] – 2026-08-15

### Hinzugefügt
- **Hinweis auf das Demo-Kontingent direkt beim App-Start.** Problem: Beim
  Teilen des Vercel-Links (z.B. LinkedIn) erfuhren Erstbesucher vom
  lebenslangen Limit aus `DEMO_LIFETIME_MAX` (`api/gemini.js`, 30
  KI-Anfragen/Gerät) erst, wenn eine Analyse mit 403 fehlschlug — kein
  Hinweis vorab. Lösung: Ein wegklickbarer, blauer Info-Banner ("Kostenlose
  Vorschau") oberhalb des EU-AI-Act-Haftungsausschlusses informiert jetzt
  schon beim ersten Öffnen über das Limit, statt Nutzer erst beim
  Fehlschlagen zu überraschen.

## [1.24.3] – 2026-08-15

### Geändert
- **UI-Begriff "Gewerk" durch "Beruf" ersetzt.** Grund: "Gewerk" wirkt als
  Bau-/Ausschreibungsjargon sperrig, gerade für Privatnutzer ohne
  Handwerksausbildung. "Beruf" ist eingängiger und passt genauso zur
  bestehenden Auswahl (Klempner, Elektriker, ...). Betrifft alle
  UI-Texte in `App.jsx` (Berufsauswahl, PDF-Export, YouTube-Suche,
  Verlaufsliste) sowie die entsprechenden Stellen in `README.md`.

## [1.24.2] – 2026-08-15

### Geändert
- **`fetchWithRetry` wiederholt 429-Antworten nicht mehr automatisch.**
  Grund: Der serverseitige Rate-Limiter (`api/gemini.js`) zählt in einem
  festen 60-Sekunden-Fenster; die bisherigen bis zu 3 automatischen Retries
  (≈7s Backoff) lagen garantiert noch im selben Fenster und scheiterten
  daher immer erneut — sie verschärften den Verbrauch des Fensters sogar
  zusätzlich, wenn mehrere Tools kurz hintereinander liefen (Hauptanalyse +
  Zusatz-Tools). Beobachtet als "auffällig funktioniert ein erneuter Klick
  auf 'Vorlesen' einfach so" — der zweite, manuelle Klick kam schlicht erst,
  nachdem das Rate-Limit-Fenster zurückgesetzt war. Nur echte 5xx-Serverfehler
  und Netzwerkfehler werden weiterhin automatisch wiederholt; bei 429 (und
  anderen 4xx) bekommt der Aufrufer die Antwort direkt und liest die
  Klartext-Fehlermeldung aus dem Response-Body — analog dazu jetzt auch in
  `callGeminiTtsSummaryAPI` die gleiche JSON-Fehler-Klartext-Extraktion wie
  bei den übrigen 5 API-Aufrufern.

## [1.24.1] – 2026-08-15

### Geändert
- **Aussagekräftigere Fehlermeldung bei 429/5xx-Antworten in `fetchWithRetry`.**
  Nach Ausschöpfen der Retries warf `fetchWithRetry` (`App.jsx`) bislang
  `API error: ${response.statusText}` — auf HTTP/2-Antworten (so liefert
  Vercel `/api/gemini` aus) ist `statusText` laut Spec immer leer, wodurch im
  Error-Report nur der nichtssagende Text "API error:" ankam (siehe Report
  im Kontext `gemini-tts-summary-api`, 14.8.2026 22:29 Uhr, V1.24.0). Die
  Meldung enthält jetzt zusätzlich den numerischen Status
  (`API error: 429`/`API error: 500 Internal Server Error`).

## [1.24.0] – 2026-08-14

### Hinzugefügt
- **Akustischer Hinweis nach Analyse-Abschluss.** Bei einer erfolgreichen
  Bauproblem-Analyse (`callGeminiVisionAPI` in `App.jsx`) ertönt jetzt ein
  kurzer "Bling"-Ton, sobald die Lösung eintrifft — nützlich, wenn man
  während der Wartezeit den Tab gewechselt hat und sonst nicht mitbekommt,
  dass das Ergebnis fertig ist. Der Ton wird per Web Audio API synthetisch
  erzeugt (`playCompletionSound`, zwei kurze Sinustöne), damit kein
  zusätzliches Audio-Asset ausgeliefert werden muss.

## [1.23.1] – 2026-08-14

### Geändert
- **Namens-Konsolidierung auf "Sm@rtCraft".** Der lokale Projektordner trug
  versehentlich den Tippfehler "Sm@artcraft" (ein "a" zu viel). Im
  PDF-Export (`handleExportPdf` in `App.jsx`) standen zudem noch zwei
  Stellen mit "SM@RTCRAFT" in Großbuchstaben (Titel-Tag, Fußzeile) —
  inkonsistent zur sonst überall bereits korrekten Schreibweise
  "Sm@rtCraft". Der npm-Paketname in `package.json` wurde von
  `smartcraft-baustellenanalyse` (Relikt der alten, seit V1.9.2 abgelösten
  Tagline) auf `smartcraft` verkürzt — `@` ist in npm-Paketnamen nicht
  erlaubt, daher als technisches Kürzel ohne Sonderzeichen. Firebase-/GCP-
  Projekt-ID (`smartcraft-baustellenanalyse`) sowie der Firestore-`appId`-
  Pfad in `App.jsx` bleiben bewusst unverändert, da beide nicht umbenennbar
  sind bzw. eine Änderung bestehende Nutzerdaten (Analyse-Historie,
  Fehlerreports, Profile) von ihrem Firestore-Pfad trennen würde — siehe
  Begründung bereits in V1.9.2.

## [1.23.0] – 2026-08-13

### Hinzugefügt
- **Serverseitiges Demo-Kontingent für `/api/gemini`.** Bisher lief das
  bestehende IP-basierte Rate-Limiting (12/Minute, 200/Tag) nach jedem
  Fenster automatisch zurück — für den öffentlich geteilten Vercel-Link
  (z.B. LinkedIn) hätte damit jede IP dauerhaft kostenpflichtige Anfragen
  stellen können. Der bestehende Firestore-Zähler pro IP (`_rateLimits/{ip}`)
  führt jetzt zusätzlich einen nie zurückgesetzten `lifetimeCount`; ab
  `DEMO_LIFETIME_MAX` (30 Anfragen, siehe `api/gemini.js`) antwortet der
  Endpoint mit `403` statt `429` und einer Klartext-Meldung
  ("Demo-Kontingent erreicht ..."). Bewusst `403` statt `429`: `fetchWithRetry`
  in `src/App.jsx` wiederholt 429/5xx automatisch mit Backoff, ein
  aufgebrauchtes Demo-Kontingent ist aber endgültig und soll nicht erst
  drei Retries lang hängen. Zusätzlich zeigen alle Gemini-Aufrufstellen in
  `src/App.jsx` jetzt die vom Server gelieferte `error`-Klartextmeldung an,
  statt den rohen JSON-Antworttext in die Fehlermeldung einzubetten.

## [1.22.4] – 2026-08-13

### Behoben
- **Root Cause für `gemini-vision-api`-Fehler gefunden und behoben:
  `FUNCTION_PAYLOAD_TOO_LARGE`.** Dank des verbesserten Error-Passthroughs
  aus `[1.22.2]` enthielt der nächste Report (16:17 Uhr) erstmals den echten
  Fehler statt der generischen Meldung: Vercel Serverless Functions haben
  ein hartes, nicht konfigurierbares Payload-Limit von 4,5MB. Bilder wurden
  bisher unkomprimiert per `fileToBase64()` als Base64 an `/api/gemini`
  geschickt — ein 5-12MB-Handyfoto (üblich bei modernen Android-Kameras)
  wird durch die Base64-Kodierung (+33%) zuverlässig größer als das Limit.
  `fileToBase64()` in `src/App.jsx` skaliert Bilder jetzt vor dem Senden per
  Canvas auf max. 1600px Kantenlänge herunter und kodiert sie als JPEG
  (Qualität 0,82) neu; die Roh-Datei-Obergrenze im Upload-Dialog wurde von
  5MB auf 20MB angehoben, da nicht mehr die Rohdatei, sondern das
  komprimierte Ergebnis versendet wird. Per Playwright-Test verifiziert:
  ein synthetisches 6,4MB-Rauschbild wurde auf ~930KB reduziert (86%
  kleiner), Vorschau blieb intakt, keine Konsolenfehler.
- **Beim Testen entdeckt: `new Image()` griff auf die falsche `Image`.**
  `src/App.jsx` importiert bereits ein Lucide-Icon namens `Image` (Zeile 3),
  das den globalen `Image`-Konstruktor im Modul-Scope überschattet —
  `new Image()` in der neuen Resize-Logik warf dadurch zur Laufzeit "Image
  is not a constructor" (baute aber fehlerfrei, da syntaktisch gültig). Fix:
  explizit `new window.Image()`.

## [1.22.3] – 2026-08-13

### Dokumentation
- **`error_log.md`: zweites `gemini-vision-api`-Auftreten vermerkt.** Report
  von 16:07 Uhr, noch auf V1.22.1 — lief 46s nach Push des Fixes aus
  `[1.22.2]` noch auf dem alten Vercel-Deploy vor dem Rollout, daher kein
  Hinweis auf Wirkungslosigkeit des Fixes. Root Cause weiterhin offen, bis
  ein Report mit V1.22.2+ mehr Detail liefert. Nur Dokumentation, kein Code
  geändert.

## [1.22.2] – 2026-08-13

### Behoben
- **Fehlermeldungen bei Gemini-Anfragen verschluckten die echte Ursache.**
  `callGeminiVisionAPI`, `callGeminiMaterialsAPI`, `callGeminiSafetyAPI`,
  `callGeminiClientReportAPI` und `callGeminiVideoSearch` in `src/App.jsx`
  ermittelten bei einem `!response.ok`/leeren Response bereits die konkrete
  Fehlermeldung (`errorMsg`, geloggt per `console.error`), warfen dann aber
  eine hartkodierte generische Meldung ("... oder leere Antwort.") statt
  `errorMsg` — dadurch enthielten Error-Reports (Admin-Bereich, Mail,
  `error_log.md`) nie den tatsächlichen HTTP-Status oder die
  Server-Fehlermeldung von `/api/gemini`. Jetzt wird `errorMsg` geworfen,
  analog zum bereits korrekten Verhalten von `fetchTtsAudio`/
  `callGeminiTtsSummaryAPI`. Auslöser: erneut aufgetretener
  `gemini-vision-api`-Report vom 13.8.2026 (siehe `error_log.md`), dessen
  Ursache sich mangels Detail in der Fehlermeldung nicht eingrenzen ließ.

## [1.22.1] – 2026-08-13

### Dokumentation
- **`error_log.md`: `gemini-vision-api`-Fehlerbild neu als offen
  dokumentiert.** Per Admin-Bereich gemeldeter Fehler "Fehler bei der
  KI-Anfrage oder leere Antwort." (13.8.2026, V1.22.0) ist dasselbe
  Fehlerbild, das beim Firestore-Cleanup in V1.22.0 aus der Sammlung
  entfernt, aber nie als behoben bestätigt wurde. `src/App.jsx` wirft diese
  Meldung generisch für jeden `!response.ok`-Fall von `/api/gemini`
  (App-Check-, Origin-, Rate-Limit- oder Upstream-Fehler) sowie leere
  Antworten — ohne Vercel-Logs zum Report-Zeitpunkt lässt sich die konkrete
  Ursache nicht eingrenzen. Nur Dokumentation, kein Code geändert.

## [1.22.0] – 2026-08-13

### Geändert
- **Admin-Bereich: alte Fehlerreports ausblendbar.** Analog zum bestehenden
  "Gelöste ausblenden"-Filter blendet ein neuer Toggle "Alte ausblenden"
  (standardmäßig aktiv) Reports aus, deren Zeitstempel mehr als 14 Tage
  zurückliegt (`src/AdminPanel.jsx`), damit die Liste sich auf aktuelle
  Fehlerbilder konzentriert.
- **Fehlersammlung in Firestore geleert.** Die `errorReports`-Collection-Group
  enthielt 17 größtenteils veraltete Reports (älteste von V1.8.2) über 3
  Nutzer-Pfade und wurde per `firebase firestore:delete -r` vollständig
  entfernt. `error_log.md` entsprechend zurückgesetzt und mit Hinweis auf die
  Löschung versehen (die zuvor dort dokumentierten Fehlerbilder gelten
  dadurch nicht als behoben, nur die Rohdaten wurden entfernt).

## [1.21.1] – 2026-08-13

### Behoben
- **Private Google-Konto-Adresse stand im Klartext im (öffentlichen) Repo
  und im Client-Bundle.** `ALLOWED_TTS_EMAIL` aus V1.21.0 war als Literal
  direkt in `api/tts.js` hinterlegt — für jeden auf GitHub einsehbar, da das
  Repo public ist. Zusätzlich enthielt `src/AdminPanel.jsx` seit Längerem
  denselben Klartext als Fallback-Default für `VITE_ADMIN_EMAIL`, der damit
  im ausgelieferten JS-Bundle landete (per Browser-Devtools auslesbar).
  `api/tts.js` liest die Adresse jetzt aus der neuen Env-Var
  `ALLOWED_TTS_EMAIL` (server-only, siehe README), der Fallback in
  `AdminPanel.jsx` ist entfernt (nur noch `VITE_ADMIN_EMAIL`, mit Warnung im
  Log, falls die Variable fehlt). Ältere CHANGELOG-Einträge, die die Adresse
  im Klartext nannten, wurden nachträglich anonymisiert. Die tatsächliche
  Konfiguration in Vercel (Production/Preview) und der lokalen `.env` bleibt
  unverändert — nur der Klartext im versionierten Code fällt weg.

## [1.21.0] – 2026-08-13

### Geändert
- **TTS-Vorlesen serverseitig auf ein einziges Google-Konto beschränkt.**
  Nachdem die Sprachausgabe (Google Cloud TTS mit Abrechnungskonto)
  vorübergehend komplett deaktiviert war, um unkontrollierte Kosten
  auszuschließen, ist sie jetzt gezielt nur für das per `ALLOWED_TTS_EMAIL`
  konfigurierte Admin-Konto wieder freigeschaltet — alle anderen Nutzer (auch mit anderem Google-Konto
  oder anonym) bekommen `403 Forbidden`. `api/tts.js` verifiziert dafür das
  vom Frontend mitgeschickte Firebase-ID-Token direkt gegen Googles
  öffentliche Zertifikate (RS256-Signaturprüfung, Standard-Claims wie
  `iss`/`aud`/`exp`) und liest `email`/`email_verified` daraus — bewusst
  ohne `FIREBASE_SERVICE_ACCOUNT_KEY`, das in Vercel bislang nicht
  hinterlegt ist. Frontend (`src/App.jsx`, `fetchTtsAudio`) holt dafür per
  `getIdToken()` ein frisches ID-Token vom eingeloggten Firebase-User und
  schickt es als `Authorization: Bearer …`-Header mit; eine Ablehnung zeigt
  jetzt "Sprachausgabe ist nur für ein autorisiertes Konto verfügbar." statt
  der generischen Fehlermeldung und löst keinen Error-Report aus.

## [1.20.1] – 2026-08-13

### Behoben
- **App-Logo im Header hing sichtbar tiefer als der Titel-Schriftzug.** Das
  Hammer-Icon im Logo (`SmarterCraftLogo`) war per `absolute w-full h-full`
  positioniert, aber ohne explizites `top-0`/`left-0`. Ohne festgelegten
  Ankerpunkt berechnet der Browser dafür eine Fallback-Position
  ("static position"), die das Icon um exakt die halbe eigene Höhe nach unten
  verschob — es überlappte sichtbar den Untertitel unter dem Header. Fix:
  `inset-0` statt der reinen Größenklassen, damit das Icon exakt auf der
  `relative`-Box des Buttons sitzt und auf gleicher Höhe wie der Titel steht.

## [1.20.0] – 2026-08-13

### Geändert
- **TTS-Sprachausgabe von der Web Speech API des Browsers auf Google Cloud
  Text-to-Speech umgestellt.** Der Ansatz aus V1.18.x/V1.19.x blieb trotz
  mehrerer Nachbesserungen unzuverlässig — der Browser meldete teils Stimmen,
  die gar keinen Ton ausgaben, wodurch der Geschlechts-Umschalter zuletzt nur
  über eine Tonhöhen-Annäherung auf derselben Stimme lief statt über echte
  unterschiedliche Stimmen. Neuer serverseitiger Proxy `api/tts.js` (gleiches
  App-Check-/Rate-Limiting-/Origin-Check-Muster wie `api/gemini.js`, eigene
  Firestore-Collection `_ttsRateLimits`) ruft die Google Cloud
  Text-to-Speech API mit echten WaveNet-Stimmen auf (`de-DE-Wavenet-A`
  weiblich, `-B` männlich), zerlegt dafür lange Diagnosetexte serverseitig an
  Satzenden in Häppchen unter 5000 Byte (API-Limit pro Anfrage). Frontend
  spielt die zurückgelieferten MP3-Daten über ein `<audio>`-Element ab und
  cacht sie pro Modus+Geschlecht (Object-URLs), damit erneutes Abspielen
  keine erneute, kostenpflichtige Anfrage auslöst. Läuft im kostenlosen
  Google-Cloud-Kontingent, benötigt aber ein GCP-Projekt mit aktivierter
  Abrechnung und API sowie einen neuen `GOOGLE_TTS_API_KEY` (siehe README).
  Der komplette Web-Speech-API-Code (Stimmenauswahl, Tonhöhen-Fallback,
  Client-seitiges Chunking) wurde entfernt.

## [1.19.4] – 2026-08-13

### Geändert
- **README-Pflege in `CLAUDE.md` verbindlich gemacht.** Der Versionshinweis im
  README-Titel und der TTS-Absatz waren wiederholt hinter dem tatsächlichen
  Stand zurückgeblieben (zuletzt: V1.19.1 im Titel, TTS-Absatz beschrieb noch
  die per Namens-Heuristik wechselnde Stimme statt der aktuellen
  Tonhöhen-Lösung aus V1.19.3). `CLAUDE.md` bekommt dafür einen eigenen
  README-Abschnitt (Titel-Version, Feature-/Tech-Stack-Beschreibung,
  Env-Var-Tabelle, "Entstehung & technische Hürden") und einen zusätzlichen
  Pflichtschritt im "Automatisches Commit & Push"-Ablauf, der die
  README-Prüfung vor jedem Commit verlangt statt sie optional zu belassen.
  README.md selbst auf V1.19.4 und den aktuellen TTS-Stand nachgezogen.

## [1.19.3] – 2026-08-13

### Behoben
- **"Männlich" blieb weiterhin wirkungslos, dazu wurde die gute Google-Stimme
  verloren.** Ursache des V1.19.2-Fixes: Wenn für "Männlich" per Namens-
  Heuristik eine passende deutsche Stimme im gesamten Stimmen-Pool gefunden
  wurde (nicht nur unter den Google-Stimmen), wechselte `pickGermanVoice` auf
  diese — z.B. eine von Windows gemeldete "Online (Natural)"-Stimme, die in
  Chrome zwar aufgelistet wird, aber keinen Ton ausgibt. Das ersetzte
  zugleich die bisher zuverlässig funktionierende "Google Deutsch"-Stimme.
  `pickGermanVoice` wählt jetzt wieder **immer** dieselbe, bekannt
  funktionierende Stimme (Google, falls vorhanden) unabhängig vom
  gewählten Geschlecht — die Namens-Heuristik (`TTS_*_NAME_HINTS`,
  `ttsVoiceMatchesGender`) entfällt komplett. Das Geschlecht wirkt sich
  stattdessen ausschließlich über `utterance.pitch` aus (männlich 0.75,
  weiblich 1.3, `TTS_PITCH_BY_GENDER`), was auf jeder Engine zuverlässig
  hörbar ist und nie zu Stille führen kann.

## [1.19.2] – 2026-08-13

### Behoben
- **TTS-Sprachausgabe brach weiterhin vorzeitig ab, Stimmeinstellung
  "Männlich" hatte keine hörbare Wirkung.** Der in V1.18.2 eingeführte
  Workaround (periodisches `pause()`/`resume()` gegen den bekannten
  Chrome-15s-Abbruch bei langen Utterances) reichte nicht aus bzw. konnte
  auf manchen Sprachengines die Wiedergabe selbst abwürgt haben, statt sie
  fortzusetzen. Ersetzt durch Zerlegen des Textes in Satz-Häppchen
  (`chunkTextForTts`, ~200 Zeichen), die als Folge kurzer, nacheinander in
  die Warteschlange gegebene `SpeechSynthesisUtterance`-Objekte abgespielt
  werden — alle bleiben per Ref referenziert, damit sie nicht vorzeitig vom
  Garbage Collector eingesammelt werden. Für die Stimmauswahl galt: Meldet
  der Browser (z.B. Chrome ohne installierte deutsche Systemstimmen, nur
  "Google Deutsch") keine einzelne Stimme mit passendem Geschlecht, fiel
  `pickGermanVoice` bislang stillschweigend auf dieselbe Stimme zurück,
  egal welches Geschlecht gewählt war — der Umschalter wirkte dadurch tot.
  Jetzt liefert `pickGermanVoice` zusätzlich `genderMatched`; fehlt ein
  passender Treffer, wird die Tonhöhe der Utterance angepasst (männlich
  tiefer, weiblich höher), damit der Umschalter immer hörbar etwas bewirkt,
  und ein Hinweistext unter der Stimmenanzeige erklärt den Fallback. Die
  Namens-Heuristik wurde zudem um gängige Edge/Windows-"Online (Natural)"-
  Stimmennamen erweitert (Conrad, Katja, Bernd, Christa, Elke, u.a.).

## [1.19.1] – 2026-08-13

### Geändert
- **README auf aktuellen Stand gebracht.** Der Titel-Versionshinweis war seit
  V1.9.3 nicht mehr nachgezogen worden, obwohl seitdem u.a. Google-Sign-In,
  Video-Suche, Mail-Versand bei Fehlerreports und TTS dazukamen. Außerdem
  behoben: die Deployment-Env-Var-Tabelle nannte `FIREBASE_SERVICE_ACCOUNT_KEY`,
  `VITE_RECAPTCHA_SITE_KEY`, `VITE_ADMIN_PIN` und `VITE_ADMIN_EMAIL` nicht,
  obwohl sie in `.env.example` längst existieren — ein Deploy allein anhand der
  README-Tabelle hätte App Check/Rate-Limiting und den Admin-Bereich vergessen;
  der Tech-Stack-Absatz nannte Tailwind noch als CDN-Variante, obwohl seit
  V1.8.2 `@tailwindcss/vite` zur Build-Zeit kompiliert; die PDF-Export-Aufzählung
  nannte die seit V1.10.0 enthaltenen Video-Anleitungen nicht; der TTS-Absatz
  kannte weder den neuen Kurz/Vollständig-Umschalter noch die männliche
  Standardstimme. Neuer Abschnitt "Entstehung & technische Hürden" fasst die
  größten Stolpersteine der Entwicklung zusammen (offener Gemini-Proxy,
  zwei Modell-Abschaltungen, Firestore-Produktionsmodus, die zwei TTS-Anläufe,
  Google-Sign-In-Tücken) und verweist für die volle Historie auf
  `CHANGELOG.md`.

## [1.19.0] – 2026-08-13

### Hinzugefügt
- **Umschalter "Kurz"/"Vollständig" für die TTS-Sprachausgabe.** Bisher wurde
  beim Vorlesen immer der komplette Diagnosetext vorgelesen. Jetzt lässt sich
  wählen, ob nur die wichtigsten Punkte oder der vollständige Text vorgelesen
  werden — Standard ist die kurze Version. Die Kurzfassung wird bei Bedarf
  einmalig per Gemini erzeugt (neue `SYSTEM_INSTRUCTION_TTS_SUMMARY`, max. 5
  Sätze, reiner Fließtext ohne Markdown) und für den aktuellen Diagnosetext
  zwischengespeichert (`ttsShortText`), sodass wiederholtes Abspielen keine
  erneute Anfrage auslöst. Bei neuer Diagnose wird die zwischengespeicherte
  Kurzfassung verworfen. Während der Erstellung zeigt der Button einen
  Lade-Spinner ("Kurzfassung wird erstellt…") und ist deaktiviert.

## [1.18.3] – 2026-08-13

### Geändert
- **Standardstimme der TTS-Sprachausgabe auf männlich umgestellt.** Beim
  ersten Aufruf (ohne gespeicherte Präferenz in `localStorage`) wählt
  `ttsGender` jetzt `'male'` statt `'female'` als Vorgabe; eine bereits
  getroffene Nutzer-Wahl bleibt wie gehabt erhalten.

## [1.18.2] – 2026-08-13

### Behoben
- **TTS-Sprachausgabe brach ohne Vorwarnung nach kurzer Zeit ab.** Ursache
  war ein bekannter Chrome-Bug: Das `SpeechSynthesisUtterance`-Objekt wurde
  von der Web Speech API selbst nicht referenziert, sondern nur von der
  lokalen Variable in `handleToggleTts` — sobald diese Funktion durchgelaufen
  war, konnte der Garbage Collector das Objekt mitten in der Wiedergabe
  einsammeln und die Ansage brach ab. Behoben, indem die Utterance zusätzlich
  in einer Ref (`ttsUtteranceRef`) für die Dauer der Wiedergabe gehalten wird.
  Der bereits vorhandene Workaround für den separaten 15s-Abbruch-Bug
  (periodisches pause/resume) bleibt unverändert bestehen.

## [1.18.1] – 2026-08-13

### Zurückgenommen
- **Infografik-Ansicht (Schritt-Karten) für die KI-Diagnose wieder entfernt.**
  Kurz zuvor in V1.19.0 eingeführt, hat die App danach nicht mehr wie
  gewünscht funktioniert — die Ergänzung hat die App insgesamt überladen.
  Die Idee ist nicht verworfen, sondern zurückgestellt: bei Gelegenheit neu
  angehen, wenn dafür Zeit ist, statt sie auf die bestehende Textanzeige
  draufzusatteln.

## [1.18.0] – 2026-08-12

### Hinzugefügt
- **Sprachausgabe (TTS) für die KI-Diagnose reaktiviert.** Der frühere Anlauf
  (serverseitiger Gemini-TTS-Aufruf) war wegen fehlender API-Berechtigung
  (Status 401) dauerhaft deaktiviert und der zugehörige tote Code bereits
  entfernt (siehe `README.md`, „Bekannte Einschränkungen"). Statt eines
  eigenen API-Calls läuft die neue Umsetzung rein clientseitig über die
  Web Speech API des Browsers (`window.speechSynthesis`) — kein API-Key,
  keine Autorisierungsprobleme mehr. Ein „Diagnose vorlesen"-Button in der
  Ergebnisanzeige liest den Lösungstext vor; die Stimmenauswahl
  (`pickGermanVoice` in `App.jsx`) bevorzugt automatisch eine "Google"-Stimme,
  falls der Browser eine anbietet, und lässt sich per Weiblich/Männlich-Umschalter
  steuern (Heuristik anhand bekannter Stimmennamen, da die Web Speech API selbst
  kein Geschlecht liefert). Enthält einen Workaround für einen bekannten
  Chrome-Bug, der sehr lange Ansagen nach ca. 15s abbricht.

## [1.17.3] – 2026-08-12

### Behoben
- **Exportierter PDF-Bericht zeigte noch den alten Namen "SM@RTCRAFT -
  Baustellenanalyse".** Beim Rebranding auf die Tagline "Der Kollege in der
  Hosentasche" (V1.9.2) wurde die Überschrift im PDF-Export-Template
  (`handleExportPdf` in `App.jsx`) übersehen, da sie in einem separaten
  HTML-String für den Ausdruck steht statt in der sichtbaren React-UI. Alle
  anderen Web-Vorkommen des Namens sind interne, bewusst unveränderte
  IDs (Firebase-/Vercel-Projektname, npm-Paketname, Firestore-`appId`) —
  siehe Begründung im Eintrag zu V1.9.2.

## [1.17.2] – 2026-08-12

### Behoben
- **Reine Textbeschreibung ohne Bild ließ sich gar nicht erst eingeben.**
  Das Eingabefeld für die Problembeschreibung (`textarea` in `App.jsx`,
  Bereich „2. Problem dokumentieren & analysieren") wurde nur eingeblendet,
  wenn bereits ein Bild ausgewählt war oder das Feld selbst schon Text
  enthielt — ein Henne-Ei-Problem, das reine Texteingabe faktisch unmöglich
  machte, obwohl der Analyse-Button (und dessen Placeholder „Optional") das
  längst zuließ. Das Feld wird jetzt immer angezeigt, nur die Bildvorschau
  bleibt an ein vorhandenes Bild geknüpft.

## [1.17.1] – 2026-08-12

### Behoben
- **Hammer/Blitz-Icon im Header war auf dem Smartphone nach unten verschoben.**
  Ursache war die Umstellung des Logos von einem `<div>` auf ein echtes
  `<button>`-Element in V1.17.0 (klickbares Reset-Icon) — mobile Browser
  wenden auf `<button>` natives Chrome (Padding/Line-Height) an, das den
  darin absolut positionierten Hammer nach unten drückte. `SmarterCraftLogo`
  in `App.jsx` bekommt jetzt `appearance-none`, `p-0`/`m-0` und
  `leading-none`, um das native Button-Styling zu neutralisieren.

## [1.17.0] – 2026-08-12

### Hinzugefügt
- **App-Logo im Header setzt jetzt die Eingabefelder zurück.** Klick auf das
  Hammer/Blitz-Icon links im Header (`SmarterCraftLogo` in `App.jsx`) ruft
  dieselbe `handleReset`-Funktion wie der bestehende „Zurücksetzen"-Button
  auf — Bild, Problembeschreibung, Analyseergebnis etc. werden geleert, die
  bestehende Anmeldung (Auth-State) bleibt davon unberührt.

## [1.16.2] – 2026-08-12

### Behoben
- **Historie zeigte auf einem geteilten Gerät Analysen einer anderen Person.**
  Firestore-Analysen waren zwar korrekt pro `userId` gespeichert, aber
  Firebase Auth hält eine anonyme Sitzung standardmäßig dauerhaft
  (`browserLocalPersistence`, IndexedDB) und die App übernahm sie beim Start
  stillschweigend wieder (`App.jsx`, Firebase-Init-Effekt) — schloss jemand
  nur den Tab statt aktiv „Sitzung beenden" zu klicken, sah die nächste
  Person am selben Gerät automatisch die Historie der vorigen. Findet die App
  beim Laden bereits eine zuvor bestehende anonyme Sitzung vor (nicht in
  diesem Ladevorgang neu angelegt), fragt sie jetzt vor dem Übernehmen aktiv
  nach: „Weiter als Gast" behält die Sitzung samt Historie, „Neue Sitzung
  starten" meldet ab und legt eine frische anonyme Sitzung an.

## [1.16.1] – 2026-08-12

### Behoben
- **Google-Foto füllte den Kreis im Header-Profil-Button trotz `object-cover`
  nicht aus.** Ursache war nicht das Seitenverhältnis, sondern der Button
  selbst: `p-2`-Padding um das 24px-Bild ließ innerhalb des größeren
  gepolsterten `rounded-full`-Buttons einen sichtbaren Rand — object-cover
  kann das nicht beheben, weil das Bild schlicht kleiner als sein
  Elternelement war. Button ist jetzt fest `w-10 h-10`, das Foto füllt via
  `w-full h-full object-cover` randlos den kompletten Kreis; das Fallback-Icon
  bleibt über Flex-Zentrierung mittig. Betrifft nur den Header-Button — der
  Avatar im Profil-Modal war davon nicht betroffen (kein umschließendes
  Padding-Element dort).

## [1.16.0] – 2026-08-12

### Hinzugefügt
- **EU-AI-Act-Haftungsausschluss wegklickbar.** Der rote Hinweisblock oben im
  Hauptbereich (`App.jsx`) ließ sich bisher nicht ausblenden. Neuer runder
  roter Button mit X-Icon oben rechts in der Box blendet ihn aus (State
  `showDisclaimer`, gilt nur für die aktuelle Sitzung — nach einem Reload
  erscheint der Hinweis wieder).

## [1.15.4] – 2026-08-12

### Behoben
- **Google-Profilbild füllte den runden Avatar-Rahmen nicht vollständig aus.**
  Ohne `object-fit` passt ein `<img>` sein Seitenverhältnis standardmäßig
  unvorhersehbar an die vorgegebene Box an — je nach zurückgegebener
  Bildgröße blieb dadurch ein sichtbarer Rand im Kreis. Beide Avatar-`<img>`s
  (Header-Button, Profil-Modal, `App.jsx`) haben jetzt `object-cover`, damit
  das Foto zugeschnitten statt gestaucht/eingerückt den Kreis lückenlos füllt.

## [1.15.3] – 2026-08-12

### Behoben
- **Google-Profilbild wurde nach dem Login nicht angezeigt.** Zwei Ursachen:
  (1) Nach `linkWithPopup()` (anonym → Google) blieb `photoURL` auf dem
  User-Root-Objekt teils leer — Firebase legt die eigentlichen Provider-Daten
  in `user.providerData[]` ab, ohne die Root-Felder zuverlässig nachzuziehen.
  `toAuthUserSnapshot()` (`App.jsx`) fällt jetzt explizit auf den Google-Eintrag
  in `providerData` zurück. (2) `onAuthStateChanged` liefert nach dem Linking
  teils dasselbe (in-place mutierte) User-Objekt zurück — ein rohes
  `setAuthUser(user)` löste dadurch per React-Referenzvergleich keinen Re-Render
  aus. Snapshot wird jetzt als frisches Objekt gesetzt, zusätzlich direkt aus
  dem `linkWithPopup`/`signInWithPopup`-Ergebnis statt nur über den Listener.
  Schlägt das Laden des Fotos trotzdem fehl (Hotlink-Schutz, CSP, Netzwerk),
  fällt die UI jetzt sauber auf das generische Profil-Icon zurück (`onError`)
  statt ein kaputtes Bild anzuzeigen.

## [1.15.2] – 2026-08-12

### Behoben
- **Fehlgeschlagener Google-Login war für Nutzer unsichtbar.** Schlug
  `linkWithPopup`/`signInWithPopup` fehl (z.B. weil die aufrufende Domain
  nicht unter Firebase Authentication → Settings → Authorized domains
  freigeschaltet ist — Google-Login aktivieren allein reicht dafür nicht),
  gab es nur ein `console.error`, keine sichtbare Rückmeldung: ein kurzer
  schwarzer Screen (Popup öffnet, schließt sofort wieder) und danach schien
  nichts mehr zu passieren. `handleGoogleSignIn` (`App.jsx`) zeigt jetzt bei
  jedem Fehlschlag eine passende Meldung im Profil-Modal an (u.a. eigene
  Texte für `auth/unauthorized-domain`, `auth/popup-blocked`,
  `auth/network-request-failed`).

## [1.15.1] – 2026-08-12

### Behoben
- **Firestore-Rules-Deploy hatte kein Ziel.** `firestore.rules` lag zwar
  seit jeher im Repo, aber ohne `firebase.json`/`.firebaserc` wusste
  `firebase deploy --only firestore:rules` nicht, welches Projekt/welche
  Regel-Datei gemeint ist ("Not in a Firebase app directory"). Beide
  Dateien ergänzt (Projekt `smartcraft-baustellenanalyse`), damit die
  V1.15.0-Regel für `adminMeta` (Gelöst-Status) sowie künftige
  Rules-Änderungen sich per CLI deployen lassen.
- **`google-signin`-Fehlerkontext fehlte in `errorContextInfo.js`.** Die
  in V1.15.0 neuen `queueErrorReport('google-signin', …)`-Aufrufe
  (`App.jsx`) liefen im Admin-Bereich auf den generischen Fallback
  "Unbekannter Fehlerkontext" statt einer Ursache-/Lösungshilfe. Eintrag
  ergänzt.

## [1.15.0] – 2026-08-12

### Hinzugefügt
- **Optionales Google-Sign-In.** Bisher meldete sich jeder Nutzer ausschließlich
  anonym an (Firebase Anonymous Auth) — der Verlauf war an das jeweilige Gerät
  gebunden und es gab keine echte Identität, an der sich z.B. auffällige oder
  bösartige Nutzung festmachen ließe. Neuer Button "Mit Google anmelden" im
  Profil-Menü (`App.jsx`) verknüpft die bestehende anonyme Sitzung per Firebase
  Account-Linking (`linkWithPopup`) mit einem Google-Konto — gleiche UID, Verlauf
  bleibt erhalten, das Konto ist danach geräteübergreifend nutzbar. Ist das
  Google-Konto bereits an anderer Stelle verknüpft, fällt der Login auf
  `signInWithPopup` zurück (Hinweis: die alte anonyme Historie geht dabei
  verloren). Fehlerreports (`errorReporting.js`) speichern jetzt zusätzlich
  `reportedBy` (Name/E-Mail, falls per Google angemeldet), damit der
  PIN-geschützte Admin-Bereich (`AdminPanel.jsx`) Reports einer echten Person
  statt nur einer anonymen UID zuordnen kann — Voraussetzung, um Missbrauch
  gezielter nachzuverfolgen. Erfordert einmalig den Provider **Google** in der
  Firebase Console unter Authentication → Sign-in method (siehe README).
- **Echter "Gelöst"-Status im Admin-Bereich.** V1.14.1 hatte diese Lücke noch
  offen benannt ("es gibt in Firestore keinen 'gelöst'-Status"): `AdminPanel.jsx`
  zeigte jeden Fehlerreport dauerhaft an, auch längst behobene. Jetzt lässt sich
  pro Fehlerkontext direkt im Admin-Bereich "Als gelöst markieren" umschalten
  (`setContextResolved`/`fetchResolvedContexts` in `errorReporting.js`),
  gespeichert unter `artifacts/{appId}/adminMeta/errorResolutions` (neue
  Firestore-Regel dafür in `firestore.rules`). Standardmäßig blendet eine
  Checkbox gelöste Fehlerbilder aus der Liste aus; jeder Report zeigt zusätzlich
  ein "Gelöst seit"-Datum samt App-Version an.

## [1.14.1] – 2026-08-12

### Hinzugefügt
- **`error_log.md` als kuratiertes Fehler-Log.** Das Admin-Terminal
  (`AdminPanel.jsx`) zeigt jeden je über `queueErrorReport` gemeldeten
  Fehler unverändert für immer an — es gibt in Firestore keinen
  "gelöst"-Status, dadurch sammelten sich dort auch längst behobene
  Reports neben aktuellen an. Neue Datei `error_log.md` fasst die
  Fehlerbilder kuratiert zusammen (Kontext, Häufigkeit, betroffene
  Versionen, Ursache, Status `Offen`/`Beobachten`/`Gelöst`) und wird ab
  jetzt bei jedem Bugfix mitgepflegt (siehe `CLAUDE.md`). Neues Skript
  `scripts/fetch-error-reports.mjs` liest die Reports read-only per
  anonymer Anmeldung aus der `errorReports`-Collection-Group aus (gleicher
  Weg wie `errorReporting.js`/`AdminPanel.jsx`), Aufruf: `node --env-file=.env
  scripts/fetch-error-reports.mjs`. Erstbefüllung ergab 2 offene
  Fehlerbilder (`gemini-vision-api`: "Fehler bei der KI-Anfrage oder leere
  Antwort.", 4× zwischen V1.8.2–V1.10.0; `gemini-video-search-api`:
  "API error: ", 1× in V1.13.0) — Firestore-Reports selbst bleiben
  unangetastet als Rohdaten-Historie bestehen.

## [1.14.0] – 2026-08-12

### Hinzugefügt
- **Automatischer Mail-Versand bei Fehlerreports.** Bisher landete jeder
  `queueErrorReport`-Aufruf nur in Firestore (`errorReporting.js`) und musste im
  PIN-geschützten Admin-Bereich (`AdminPanel.jsx`) manuell per `mailto:`-Link
  weitergeleitet werden — ein Bug fiel also erst auf, wenn jemand aktiv
  nachschaute. Neue Serverless Function `api/report-bug.js` schickt jetzt
  sofort, sobald ein Fehler auftritt (`queueErrorReport` ruft im gleichen
  Zug `sendBugReportEmail` auf, egal ob am PC oder am Smartphone), eine Mail
  über die Resend-API an die Support-Adresse. Bewusst "fire and forget":
  Firestore bleibt die verlässliche Quelle (auch offline dank der
  bestehenden `localStorage`-Warteschlange), die Mail ist nur ein
  zusätzlicher Sofort-Hinweis und geht bei Netzwerkfehlern spurlos verloren,
  ohne den Report selbst zu gefährden. Gleiches Fail-open-Muster wie bei
  `api/gemini.js`: Same-Origin-Check immer aktiv, App Check + Rate-Limiting
  (5/Minute, 50/Tag pro IP) nur wenn `FIREBASE_SERVICE_ACCOUNT_KEY` gesetzt
  ist. Neue Env-Variablen `RESEND_API_KEY`, `SUPPORT_EMAIL` (fällt auf
  `VITE_ADMIN_EMAIL` zurück) und optional `RESEND_FROM_EMAIL` (siehe
  `.env.example`/README).

## [1.13.0] – 2026-08-11

### Hinzugefügt
- **Farbthema folgt dem gewählten Gewerk.** Header, Haupt-Buttons und
  Akzent-Icons/-Texte übernehmen jetzt eine gedeckte, ruhige Akzentfarbe je
  Gewerk (`TRADE_THEMES` in `src/App.jsx`) statt eines fest codierten Rot als
  Marken-/Warnfarbe zugleich — echte Warn-/Fehlerhinweise (z.B. der EU-AI-Act-
  Disclaimer) bleiben bewusst rot, damit sie als Warnung erkennbar bleiben.
  Technisch über CSS-Custom-Properties (`--accent`, `--accent-dark`,
  `--accent-soft`) gelöst, die am äußeren Container gesetzt und per
  `transition-colors duration-500/700` weich (nicht schlagartig) eingeblendet
  werden, sobald ein anderes Gewerk gewählt wird. Die fest zugeordneten
  Mehrfarben-Buttons der KI-Zusatztools (Material/Sicherheit/Video/
  Kundenbericht) sind bewusst unverändert geblieben, da sie einzelne Features
  statt der App-Marke kennzeichnen.

## [1.12.0] – 2026-08-11

### Hinzugefügt
- **Rate-Limiting + Firebase App Check für `/api/gemini`.** Der bestehende
  Origin-Check in `api/gemini.js` verhindert nur Missbrauch durch fremde
  Webseiten aus dem Browser — ein Skript, das den `Origin`-Header selbst
  setzt, kommt trivial durch. Da jeder Call einen bezahlten Gemini-API-Call
  auslöst, war das eigentliche Risiko nicht ein Server-Crash, sondern
  Kostenexplosion durch automatisierten Missbrauch. Jetzt zusätzlich:
  - **App Check** (`firebase/app-check` im Client, `firebase-admin` +
    `getAppCheck().verifyToken()` server-seitig) verifiziert, dass Requests
    tatsächlich von der eigenen Web-App kommen (reCAPTCHA v3), nicht von
    einem Skript.
  - **Rate-Limiting** über einen Firestore-Zähler pro IP
    (`_rateLimits/{ip}`, nur per Admin-SDK erreichbar): 12 Requests/Minute
    (deckt Hauptanalyse + die 4 Zusatz-Tools locker ab) und 200/Tag als
    Bremse gegen Slow-Drip-Missbrauch.
  - **Fail-open:** Ohne die neue Server-Variable
    `FIREBASE_SERVICE_ACCOUNT_KEY` verhält sich der Endpoint unverändert
    (kein Absturz direkt nach diesem Deploy). Scharf geschaltet wird erst,
    sobald `FIREBASE_SERVICE_ACCOUNT_KEY` (Service-Account-JSON) und
    `VITE_RECAPTCHA_SITE_KEY` (reCAPTCHA-v3-Key aus der App-Check-
    Registrierung) in Firebase Console + Vercel manuell hinterlegt sind —
    siehe `.env.example` für Details zu beiden Variablen.

## [1.11.0] – 2026-08-11

### Hinzugefügt
- **Admin-Bereich für Fehlerreports.** Neuer PIN-geschützter Admin-Bereich
  (`src/AdminPanel.jsx`, erreichbar über einen unauffälligen Link im
  Profil-Modal), der alle über `errorReporting.js` gesammelten Fehlerreports
  über alle Nutzer hinweg auflistet (Collection-Group-Query auf
  `errorReports`) — bisher ließen sie sich nur manuell in der Firebase
  Console einsehen, wovon niemand aktiv informiert wurde. Jeder Eintrag zeigt
  Kontext, vollständige (ausgeschriebene) Fehlermeldung, Stacktrace,
  App-Version, User-Agent sowie eine statische Ursache-/Lösungshilfe je
  bekanntem Fehlerkontext (`ERROR_CONTEXT_INFO` in `errorReporting.js`). Ein
  Button je Eintrag öffnet einen vorausgefüllten `mailto:`-Link (Ziel via
  `VITE_ADMIN_EMAIL`) mit allen Details,
  damit der Fehler direkt an den Admin gemeldet werden kann.
  **Sicherheitshinweis:** Der PIN (`VITE_ADMIN_PIN`) ist reiner UI-Sichtschutz
  und landet im Client-Bundle. Damit die Collection-Group-Query technisch
  funktioniert, erlaubt `firestore.rules` jedem authentifizierten (auch
  anonymen) Nutzer Lesezugriff auf `errorReports` — wer die Firestore-SDK
  direkt anspricht, kommt auch ohne PIN an die Reports. Für eine spätere
  Ausrollung mit echten Fremdnutzern sollte das durch echten Admin-Login
  (fester Account + Regel auf `request.auth.uid`) ersetzt werden. Schreiben
  bleibt weiterhin ausschließlich dem jeweiligen Besitzer vorbehalten.

## [1.10.0] – 2026-08-11

### Hinzugefügt
- **Video-Anleitungs-Suche reaktiviert.** Der Button war seit Commit `cc04243`
  fest deaktiviert (`disabled={true}`), nachdem die zuvor komplett
  auskommentierte Implementierung als "toter Code" entfernt worden war und nur
  noch ein leerer Funktions-Stub übrig blieb. `callGeminiVideoSearch` ruft jetzt
  wieder den Gemini-Proxy mit Google-Search-Grounding
  (`tools: [{ google_search: {} }]`) auf, um 3-5 passende YouTube-Tutorials zur
  aktuellen Lösung zu finden. Ursache/Anpassung gegenüber der alten Fassung:
  `responseSchema`/`responseMimeType` (strukturierter JSON-Modus) lassen sich in
  der Gemini API nicht mit dem `tools`-Grounding kombinieren — das JSON-Array
  wird daher per Prompt-Anweisung erzwungen und robust per Regex aus der
  Textantwort extrahiert (Fallback-Logik war im alten Code bereits vorhanden).
  README-Abschnitte, die den Feature-Status noch als "vorbereitet, aber
  deaktiviert" beschrieben, wurden entsprechend aktualisiert.

## [1.9.3] – 2026-08-11

### Geändert
- **README stark erweitert.** Der bisherige Text beschrieb primär den
  Berufseinsatz auf der Baustelle. Ergänzt: ein eigener Abschnitt "Für wen ist
  Sm@rtCraft?", der die bereits heute vorhandene Nutzbarkeit für Privatpersonen
  zuhause (z.B. Riss im Putz, tropfender Wasserhahn, kranke Zimmerpflanze) neben
  dem Profi-Einsatz gleichwertig darstellt, sowie ein knapper
  Ablauf-in-der-Praxis-Abschnitt. Grund: die App unterscheidet technisch schon
  heute nicht zwischen Profi- und Privatnutzung — das README hat das bisher
  nicht sichtbar gemacht. Der Ausblick-Abschnitt nennt jetzt auch die geplanten
  Gewerke-Sondereditionen und die separate "Sm@rtCraft Zuhause"-Variante als
  nächste Ausbaustufe.

## [1.9.2] – 2026-08-11

### Geändert
- **Rebranding: neue Tagline "Der Kollege in der Hosentasche".** Ersetzt den
  bisherigen Untertitel "Baustellenanalyse", der zu stark auf klassische
  Baustellen-Einsätze eingegrenzt war. Grund: geplante Gewerke-Sondereditionen
  und eine Privatanwender-Variante sollen unter derselben Kernmarke laufen —
  "Baustellenanalyse" hätte das nicht mehr abgedeckt. Betroffen: `index.html`
  (Title), `src/App.jsx` (Header-Untertitel), `README.md`- und
  `CHANGELOG.md`-Titel. Der interne Firestore-`appId` (`smartcraft-
  baustellenanalyse` in `src/App.jsx`) und der npm-Paketname in `package.json`
  bleiben bewusst unverändert, da eine Änderung dort bestehende Nutzerdaten-
  Pfade in Firestore bricht bzw. keinen sichtbaren Nutzen hätte.

## [1.9.1] – 2026-08-11

### Hinzugefügt
- Diese Datei. Rekonstruiert die bisherige Versionshistorie aus der
  Git-Historie, um Problem → Ursache → Lösung pro Version nachvollziehbar
  zu machen. Wird ab jetzt bei jeder nennenswerten Änderung fortgeführt.

## [1.9.0] – 2026-08-11

### Hinzugefügt
- **Lokales Error-Reporting mit automatischem Versand.** Fehler (React-Crashes,
  Firebase-Init/Auth-Fehler, alle vier Gemini-API-Aufrufe) werden zuerst in
  einer `localStorage`-Warteschlange gepuffert (`src/errorReporting.js`).
  Sobald eine authentifizierte Firestore-Verbindung besteht — beim App-Start,
  bei Wiederherstellung der Internetverbindung (`online`-Event) oder direkt
  im Anschluss an den Fehler, falls ohnehin schon online — werden sie
  automatisch unter dem privaten Nutzerpfad
  (`artifacts/{appId}/users/{userId}/errorReports`) abgelegt. Bewusst nicht
  angebunden an einfache Validierungsmeldungen (z.B. "Bild zu groß"), nur an
  echte technische Fehler.
  Idee und Anstoß dazu kamen vom Projektinhaber, gedacht für den
  Baustellen-Alltag mit unzuverlässiger Verbindung.

### Infrastruktur-Fix (kein Code-Commit, aber Teil dieser Version)
- **Problem:** Firestore Database war im Firebase-Projekt nie angelegt bzw.
  die lokale `firestore.rules`-Datei nie in der Firebase Console
  veröffentlicht. Symptom: `FirebaseError: Missing or insufficient
  permissions` beim Laden des Nutzerprofils, der Historie und (neu) beim
  Senden von Error-Reports.
  **Lösung:** Firestore Database im Firebase Console manuell angelegt
  (Produktionsmodus, Region `europe-west3`) und den Inhalt von
  `firestore.rules` im Rules-Editor veröffentlicht.

### Bekannt, aber (noch) nicht behoben
- Vereinzelte Race Condition: der allererste Profil-Ladeversuch direkt nach
  dem anonymen Login schlägt manchmal noch mit `permission-denied` fehl
  (Auth-Token vermutlich noch nicht vollständig propagiert). Nicht
  blockierend, fällt still auf den Standard-Gewerk-Wert zurück.
- Problembeschreibungs-Textfeld ist im UI unsichtbar, bis entweder ein Bild
  ausgewählt oder das Feld selbst schon Text enthält (Henne-Ei-Problem) —
  wodurch eine reine Text-Analyse ohne Foto aktuell über die UI nicht
  auslösbar ist, obwohl die Willkommensmeldung das als gültige Option nennt.
- Für die Error-Reports gibt es noch kein Auswertungs-Dashboard; sie landen
  als Rohdokumente in der Firestore-Konsole.

## [1.8.2] – 2026-08-11

### Behoben
- **Retry-Logik invertiert:** `fetchWithRetry` brach bei HTTP-Status
  502/503/504 sofort ab, anstatt es erneut zu versuchen — genau der
  Statuscode, den die eigene Serverless-Function (`api/gemini.js`) bei
  einem Upstream-Fehler zurückgibt. Die Wiederholungs-Bedingung war
  falsch herum formuliert.
- **Datei-Input-Reset betraf nur ein Feld:** `handleReset` setzte wegen
  eines `||`-Kurzschlusses immer nur `camera-input` zurück. Wurde ein Bild
  über "Galerie" gewählt, ließ sich dieselbe Datei danach nicht erneut
  auswählen (kein `change`-Event bei unverändertem Wert). Jetzt werden
  alle drei Datei-Inputs (Kamera/Galerie/Cloud) einzeln geleert.

### Geändert
- **Tailwind CSS läuft nicht mehr über die Play-CDN**
  (`<script src="https://cdn.tailwindcss.com">`), sondern wird per
  `@tailwindcss/vite` zur Build-Zeit kompiliert. Die CDN-Variante ist laut
  Tailwind selbst nur für Prototyping gedacht: JIT-Compiling im Browser,
  kein Purging, und ohne Zugriff auf die CDN (z.B. schlechte Verbindung auf
  der Baustelle) rendert die App komplett ungestyled.
- Hintergrundbild-Container haben jetzt eine Fallback-Hintergrundfarbe,
  falls die externe Bild-URL mal nicht lädt.
- Toter Code entfernt: die nie aktive TTS-Funktionalität (WAV-Encoder,
  State, Cleanup-Logik) sowie der komplett auskommentierte
  Video-Suche-Block.

### Hinzugefügt
- React `ErrorBoundary`-Komponente fängt unerwartete Rendering-Fehler ab
  (z.B. bei fehlerhafter Firebase-Config) und zeigt eine Fehlermeldung mit
  Neu-laden-Button statt eines weißen Bildschirms.

## [1.8.1] – 2026-08-11

### Behoben
- **Offener Gemini-Proxy:** `api/gemini.js` nahm Requests von jeder
  beliebigen Seite an, ohne Origin-, Auth- oder Rate-Limit-Prüfung. Da der
  Server-seitige `GEMINI_API_KEY` dahintersteckt, hätte das fremden Seiten
  erlaubt, das API-Kontingent/die Kosten des Projekts zu belasten. Der
  Endpoint lehnt jetzt Requests ab, deren `Origin`-Header nicht zum `Host`
  passt.
- **Wirkungsloser Firebase-Config-Check:** `Object.keys(firebaseConfig).length
  === 0` war nie `true`, weil das Config-Objekt immer alle 7 Keys besitzt
  (auch wenn die Werte `undefined` sind). Fehlten die `VITE_FIREBASE_*`
  Env-Variablen, crashte `initializeApp()` ungefangen. Jetzt werden die
  Pflichtfelder (`apiKey`, `projectId`) geprüft und die Initialisierung
  zusätzlich per `try/catch` abgesichert.

## [1.8.0] – 2026-08-11

### Hinzugefügt
- Dismiss-Button (X) in der Analysefehler-Box, der nur den Fehlerzustand
  zurücksetzt statt des kompletten Formulars inklusive bereits gewähltem
  Foto.
- Einheitliche Versionierung: die App-Version wird jetzt einzig aus
  `package.json` gelesen (`vite.config.js` → `define: { __APP_VERSION__ }`)
  statt an mehreren Stellen im Code hartcodiert zu sein.
- `CLAUDE.md` mit Projekt-Regeln für automatisches Commit/Push und
  Versionierung angelegt.

## [1.7.1] – 2026-08-10

### Hinzugefügt
- **Initialer Import:** Migration von einem Google-AI-Studio-Canvas-Export
  zu einem eigenständigen Vite/React-Projekt. Gemini-Aufrufe laufen seitdem
  über einen Vercel-Serverless-Proxy, damit der API-Key nie im Browser
  sichtbar ist; die Firebase-Config kommt aus echten Env-Variablen statt
  aus von Canvas injizierten globalen Variablen.
- README komplett neu geschrieben: vollständiger Funktionsumfang
  (Gewerk-Auswahl, Diagnose, Materialliste, Sicherheits-Check,
  Kundenbericht, PDF-Export, Historie) sowie die persönliche Motivation
  hinter dem Projekt dokumentiert.
- Kamera-Aufnahme: der "Foto wählen"-Button öffnet jetzt über
  `capture="environment"` direkt die Rückkamera auf Mobilgeräten, statt nur
  eine generische Dateiauswahl zu zeigen — passend zum eigentlichen
  Use-Case (Foto vor Ort schießen, nicht aus vorhandener Galerie wählen).
  Der separate Galerie-Button bleibt für bereits vorhandene Fotos erhalten.
