# Projekt-Anweisungen für Claude

## Versionierung

`package.json` (`version`) ist die einzige Quelle für die App-Version. Sie wird
zur Build-Zeit über `vite.config.js` (`define: { __APP_VERSION__ }`) eingelesen
und in `src/App.jsx` im Header angezeigt (`(V{__APP_VERSION__})`). Nirgendwo
sonst im Code hardcoden. `README.md` wird nicht automatisch aus `package.json`
generiert — der Versionshinweis im README-Titel (`... (V{version})`) muss bei
**jedem** Versions-Bump manuell nachgezogen werden, siehe README-Abschnitt
unten und "Automatisches Commit & Push".

## Changelog

`CHANGELOG.md` dokumentiert die Versionshistorie (Problem → Ursache → Lösung
je Eintrag, gruppiert nach Version). Bei jedem Versions-Bump (siehe unten)
einen passenden Eintrag ergänzen — nicht nur committen, ohne die Datei
nachzuziehen.

## README

`README.md` ist keine Ableitung aus dem Code — sie muss bei jeder Aufgabe, die
sie betrifft, explizit mitgepflegt werden, sonst veraltet sie unbemerkt (das
ist bereits mehrfach passiert). Vor dem Versions-Bump/Commit prüfen und bei
Bedarf nachziehen:

- **Versionshinweis im Titel** (`... (V{version})`) — immer auf den neuen
  `package.json`-Stand bringen, auch bei reinen Patch-Bumps.
- **Feature-/Tech-Stack-Beschreibung** — neue oder geänderte Features (z.B.
  TTS-Optionen, neue KI-Tools, Auth-Methoden) müssen sich hier wiederfinden,
  nicht nur im Changelog.
- **Env-Var-/Deployment-Tabelle** — neue benötigte `VITE_*`/Server-Env-Vars
  sofort ergänzen, sonst führt ein Deploy anhand der README-Tabelle zu
  fehlender Konfiguration.
- **"Entstehung & technische Hürden"** — bei größeren, in Produktion erst
  sichtbar gewordenen Stolpersteinen (wie bisherige Einträge dort) einen
  kurzen Absatz ergänzen, wenn die Aufgabe genau das war.

## Fehler-Log

`error_log.md` ist die kuratierte Übersicht der über den Admin-Bereich
(`AdminPanel.jsx` / Firestore-`errorReports`-Collection) gemeldeten Fehler —
im Gegensatz zum Admin-Terminal (das jeden je gemeldeten Report für immer
anzeigt) mit Status pro Fehlerbild (`Offen`/`Beobachten`/`Gelöst`). Aktuelle
Reports lassen sich per `node --env-file=.env scripts/fetch-error-reports.mjs`
live aus Firestore abrufen.

Wird ein in `error_log.md` gelisteter Fehler im Rahmen einer Aufgabe behoben:
Eintrag von "Offene Fehler" nach "Gelöste Fehler" verschieben, Status samt
Versionsverweis (auf den neuen `CHANGELOG.md`-Eintrag) ergänzen. Neu über den
Admin-Bereich gemeldete, noch unbekannte Fehler bei Gelegenheit als offener
Eintrag ergänzen.

## Automatisches Commit & Push

Nach Abschluss einer sinnvollen Arbeitseinheit (z.B. ein Feature, ein Bugfix,
eine abgeschlossene Anfrage) **ohne erneutes Nachfragen**:

1. Version in `package.json` per Semver bumpen:
   - **patch** für Bugfixes, kleine Anpassungen, Doku
   - **minor** für neue Features
   - **major** nur auf explizite Anweisung (Breaking Change)
2. `CHANGELOG.md` um einen Eintrag für die neue Version ergänzen.
3. `README.md` auf Aktualität prüfen (siehe Abschnitt "README" oben) und bei
   Bedarf nachziehen — mindestens der Versionshinweis im Titel, bei
   inhaltlichen Änderungen auch Feature-/Tech-Stack-/Env-Var-Abschnitte.
4. Änderungen committen mit einer knappen, aussagekräftigen Message
   (Stil der bisherigen Commits: `feat: ...`, `fix: ...`, `docs: ...`).
5. Nach `origin/master` pushen.

Gilt nicht bei erkennbar unfertigem/kaputtem Zwischenstand (z.B. Build schlägt
fehl, Task noch explizit offen) — dann erst fertigstellen, dann committen/pushen.
Destruktive Git-Operationen (force-push, reset --hard, Branches löschen) bleiben
weiterhin nur nach expliziter Bestätigung erlaubt.
