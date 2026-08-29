# Blitzdiagnose

Foto machen, KI analysiert es und gibt konkrete Tipps – ohne Kategorie-Vorwahl,
ohne Login. Eigenständige App in diesem Ordner, unabhängig vom Sm@rtCraft-Code
im Repo-Root.

## Verhältnis zu Sm@rtCraft

Gleiches Grundprinzip wie Sm@rtCraft (Foto → KI-Diagnose → Tipps), aber bewusst
anders zugeschnitten:

|                     | Sm@rtCraft (Repo-Root)                  | Blitzdiagnose (dieser Ordner)      |
|---------------------|------------------------------------------|--------------------------------------|
| Zielgruppe          | Handwerk/Baustelle + Privathaushalt       | Alltag allgemein, keine Vorauswahl   |
| Kategorie           | Beruf vorab wählen                        | KI erkennt das Thema selbst aus dem Foto |
| Login/Konto         | Ja (Firebase Auth, Google-Sign-In)        | Nein                                 |
| Backend             | Vercel-Funktion + Firebase (App Check, Firestore-Kontingent/Rate-Limit, Historie) | Vercel-Funktion, sonst rein clientseitig |
| Verlauf/Historie    | Ja (Firestore + lokale Sicherung)         | Nein                                 |

Die Vereinfachung war eine bewusste Entscheidung: kein Login, keine Historie,
kein Firebase. Die Modellwahl (`gemini-flash-lite-latest`) und die
Bild-Kompression vor dem Versand wurden 1:1 aus den in Produktion gemachten
Erfahrungen von Sm@rtCraft übernommen (siehe `../README.md`,
"Entstehung & technische Hürden").

## Tech-Stack

- Vite + React 19 + Tailwind CSS 4
- `vite-plugin-pwa` (installierbar auf dem Homescreen, App-Shell-Caching)
- Eine Vercel-Serverless-Funktion (`api/analyze.js`) als Proxy vor der
  Gemini-API, damit der API-Key nie im Client-Code landet

## Lokal starten

```bash
cd blitzdiagnose
npm install
cp .env.example .env
# GEMINI_API_KEY in .env eintragen
npm run dev
```

Die Vercel-Funktion (`api/analyze.js`) läuft lokal nur über `vercel dev`
(nicht über `vite dev` allein) - für reine UI-Arbeit reicht `npm run dev`,
für den vollen Foto-Analyse-Flow lokal `vercel dev` im Ordner `blitzdiagnose`
verwenden.

PWA-Icons aus `public/favicon.svg` erzeugen (einmalig bzw. nach Änderung des
Favicons):

```bash
npm run generate-pwa-assets
```

## Deployment (Vercel)

Dieser Ordner ist bewusst ein eigenständiges Projekt (eigene `package.json`,
eigene `api/`) und **kein** Teil des Root-Vercel-Projekts von Sm@rtCraft. Zum
Deployen ein neues Vercel-Projekt anlegen und als "Root Directory"
`blitzdiagnose` einstellen. Benötigte Umgebungsvariable dort:

| Variable          | Zweck                                             |
|-------------------|----------------------------------------------------|
| `GEMINI_API_KEY`  | Server-seitiger Key für `api/analyze.js`           |

## Bekannte Einschränkungen (Stand v0.1.0)

- **Kein persistentes Rate-Limiting.** `api/analyze.js` bremst Missbrauch nur
  best-effort pro warmer Vercel-Instanz (In-Memory-Zähler, 12 Anfragen/Minute
  und IP) - anders als Sm@rtCraft gibt es keinen Firestore-Zähler, der über
  mehrere Instanzen/Kaltstarts hinweg gilt. Für einen privaten/kleinen
  Nutzerkreis ausreichend; bei öffentlicher Verbreitung sollte hier
  nachgerüstet werden (z.B. Vercel KV/Upstash Redis für einen echten,
  geteilten Zähler).
- **Keine Historie.** Jede Analyse ist flüchtig; nach "Neues Foto" ist das
  Ergebnis weg. Kann bei Bedarf über `localStorage` ergänzt werden, ohne
  gleich ein Backend/Login zu brauchen.
