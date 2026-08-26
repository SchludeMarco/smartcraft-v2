import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
Camera, Image, Upload, Wrench, Loader2, Zap, AlertTriangle, CheckCircle,
Smartphone, FileText, Pipette, Paintbrush, Flower, Hammer, BrickWall, Home,
Settings, MoreHorizontal, User, Package, Shield, Video, RefreshCw,
Volume2, VolumeX, List, X, Lock, Info, MessageSquarePlus,
Sparkles, Droplets, Search, Calculator, CloudRain, Bug, Scissors, TreePine, Ruler, Layers, HardHat,
ExternalLink
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
getAuth, onAuthStateChanged, signOut,
GoogleAuthProvider, signInWithPopup, linkWithPopup, signInWithCredential, getIdToken, getIdTokenResult
} from 'firebase/auth';
import {
initializeAppCheck, ReCaptchaV3Provider, getToken as getAppCheckToken
} from 'firebase/app-check';
import {
getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs,
orderBy, limit, serverTimestamp
} from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig';
import { queueErrorReport, flushErrorReports, setErrorReportingAppCheck } from './errorReporting';
import AdminPanel from './AdminPanel';
import LegalPanel from './LegalPanel';
import FeedbackModal from './FeedbackModal';
import { FREE_TRIAL_MAX } from '../shared/trialLimit.js';
import { APP_ID as appId } from '../shared/appId.js';

// Gemini-Aufrufe laufen über eine eigene Serverless-Function (api/gemini.js),
// damit der API-Key nie im Browser sichtbar ist.
const apiUrl = '/api/gemini';
// Rein lesender Zwilling (api/trial-status.js): liefert den aktuellen Stand
// des Pro-Konto-Kontingents (FREE_TRIAL_MAX), ohne ihn zu verbrauchen — für
// die Anzeige beim App-Start, bevor die erste echte Anfrage läuft.
const trialStatusUrl = '/api/trial-status';
// DSGVO-schonender App-Start-Zähler (api/app-start.js): erhöht serverseitig
// nur ein Tages-Aggregat pro grober Region (Land/Stadt aus Vercel-Geo-
// Headern), kein Log einzelner Starts mit Zeitstempel/Standort pro Person.
const appStartUrl = '/api/app-start';
// Sprachausgabe (TTS) läuft über einen eigenen Serverless-Proxy (api/tts.js)
// zur Google Cloud Text-to-Speech API — gleicher Grund wie bei apiUrl: der
// API-Key darf nie im Browser sichtbar sein.
const apiTtsUrl = '/api/tts';
// Modul-Variable statt React-State, weil fetchWithRetry außerhalb der
// Komponente liegt und synchron auf die App-Check-Instanz zugreifen muss.
let appCheckInstance = null;
// Gleicher Grund wie appCheckInstance: hält die Auth-Instanz für fetchWithRetry
// bereit, damit /api/gemini das ID-Token des eingeloggten Nutzers mitschicken
// kann (Voraussetzung für den serverseitigen Admin-Custom-Claim-Check UND das
// Pro-Konto-Kontingent, siehe api/gemini.js getVerifiedUser). Für normale
// Nutzer identifiziert das Token nur die uid fürs eigene Kontingent — der
// Admin-Bypass greift ausschließlich bei gesetztem Claim "admin: true".
let currentAuthInstance = null;
// NEUE SYSTEM INSTRUCTION: Betont die Problembeschreibung stärker
const SYSTEM_INSTRUCTION = "Du bist ein erfahrener Bauingenieur und Zimmermann, spezialisiert auf die Fehlerbehebung und Lösungsfindung bei Bauproblemen. Analysiere das bereitgestellte Bild basierend auf dem GLEICHZEITIG GELIEFERTEN GEWERK und der Problembeschreibung. Ist eine Problembeschreibung vorhanden, MUSS sich die Analyse VORRANGIG auf diese Beschreibung konzentrieren. Gib eine präzise Diagnose sowie eine klare, schrittweise Lösung für einen erfahrenen Handwerker. Antworte immer auf Deutsch. Halte die Sprache professionell, aber direkt und praxisnah.";
const SYSTEM_INSTRUCTION_MATERIAL = "Du bist ein Einkaufsmanager für Handwerksbetriebe. Analysiere den folgenden Lösungsvorschlag und erstelle eine JSON-Liste der benötigten Materialien und Werkzeuge. Gib nur das JSON-Array aus.";
const SYSTEM_INSTRUCTION_SAFETY = "Du bist ein Arbeitsschutz-Experte (Sicherheitstechniker). Analysiere den folgenden Lösungsvorschlag und identifiziere alle potenziellen Risiken. Erstelle eine kurze Liste von Sicherheitstipps und notwendiger persönlicher Schutzausrüstung (PSA). Antworte im Markdown-Format.";
const SYSTEM_INSTRUCTION_CLIENT_REPORT = "Du bist ein Projektmanager mit ausgezeichneten Kommunikationsfähigkeiten. Nimm die technische Lösung und formuliere eine professionelle, jargonfreie Zusammenfassung für den Endkunden oder Projektleiter. Füge am Ende eine Liste der administrativen nächsten Schritte (z.B. Genehmigungen, Abnahmen) hinzu, die erforderlich sind. Antworte im Markdown-Format.";
const SYSTEM_INSTRUCTION_VIDEO_FINAL = "Du bist ein YouTube-Experte für Handwerks-Tutorials. Basierend auf dem folgenden Lösungsvorschlag, suche und wähle die 3-5 relevantesten und aktuellsten YouTube-Video-Links aus, die eine visuelle Anleitung zur Reparatur bieten. Ignoriere alle Nicht-YouTube-Links. Antworte AUSSCHLIESSLICH mit einem JSON-Array im Format [{\"title\": \"...\", \"uri\": \"https://www.youtube.com/watch?v=...\"}], ohne zusätzlichen Text davor oder danach.";
const SYSTEM_INSTRUCTION_TTS_SUMMARY = "Du bist ein erfahrener Handwerksmeister. Fasse die folgende Diagnose und Lösung für eine mündliche Vorlesung auf das Wesentliche zusammen: das Problem und die wichtigsten Lösungsschritte, in maximal 5 kurzen Sätzen. Antworte ausschließlich in reinem Fließtext ohne Markdown, Überschriften oder Aufzählungszeichen, da der Text direkt vorgelesen wird.";
// Bekannte deutsche Stimmnamen, um bei der Browser-Sprachausgabe (Fallback,
// siehe pickBrowserVoice in App) grob das gewünschte Geschlecht zu treffen —
// SpeechSynthesisVoice liefert dafür kein eigenes Attribut, nur den
// (plattformabhängigen) Anzeigenamen.
const FEMALE_VOICE_HINTS = ['anna', 'petra', 'katja', 'female', 'hedda', 'helena', 'marlene'];
const MALE_VOICE_HINTS = ['stefan', 'markus', 'male', 'yannick', 'conrad'];
// JSON Schema für die Materialliste
const MATERIAL_SCHEMA = {
type: "ARRAY",
items: {
type: "OBJECT",
properties: {
"category": { "type": "STRING", "description": "Kategorie, z.B. Material oder Werkzeug" },
"item": { "type": "STRING", "description": "Genaue Bezeichnung des Artikels" },
"quantity": { "type": "STRING", "description": "Benötigte Menge (z.B. '5 kg', '1 Rolle', '1 Stk')" }
},
required: ["category", "item", "quantity"]
}
};
// Gedeckte, ruhige Farbwelt je Beruf (kein "Warnfarben"-Rot, keine grellen
// Töne) — jeder Beruf hat einen Akzent-, Hover- und einen hellen "Soft"-Ton
// für Flächen/Badges. Die App übernimmt diese Palette global, sobald ein
// Beruf gewählt ist (siehe `theme` in der App-Komponente).
const TRADE_THEMES = {
"Klempner": { accent: "#3E6690", accentDark: "#315277", accentSoft: "#E6EDF3" },
"Elektriker": { accent: "#2D6FA6", accentDark: "#245A87", accentSoft: "#E1EBF3" },
"Maler": { accent: "#1E88B8", accentDark: "#186E94", accentSoft: "#DEEDF3" },
"Gärtner": { accent: "#2E5F8A", accentDark: "#254C6F", accentSoft: "#E2E9F0" },
"Zimmerer": { accent: "#4A6FA5", accentDark: "#3B5985", accentSoft: "#E7ECF4" },
"Mechaniker": { accent: "#35506E", accentDark: "#2A4057", accentSoft: "#DFE5EB" },
"Maurer": { accent: "#2A75A0", accentDark: "#225E82", accentSoft: "#DFECF2" },
"Dachdecker": { accent: "#1B4F72", accentDark: "#163F5C", accentSoft: "#DCE7EE" },
"Allround-Handwerker": { accent: "#4C6E96", accentDark: "#3D5878", accentSoft: "#E6E9F0" },
"Sonstig...": { accent: "#5B7089", accentDark: "#495B70", accentSoft: "#E9EBEE" },
};
const DEFAULT_TRADE = "Allround-Handwerker";
// Liste der Berufe mit Icons für die visuelle Auswahl (Farben kommen aus TRADE_THEMES)
const TRADE_ICONS = [
{ name: "Klempner", icon: Pipette },
{ name: "Elektriker", icon: Zap },
{ name: "Maler", icon: Paintbrush },
{ name: "Gärtner", icon: Flower },
{ name: "Zimmerer", icon: Hammer },
{ name: "Mechaniker", icon: Wrench },
{ name: "Maurer", icon: BrickWall },
{ name: "Dachdecker", icon: Home },
{ name: "Allround-Handwerker", icon: Settings },
{ name: "Sonstig...", icon: MoreHorizontal },
];
// Berufs-spezifische KI-Tools (zusätzlich zu den generischen "Zusätzliche
// KI-Tools"). Werden direkt unter der Berufsauswahl angezeigt, sobald ein
// Beruf mit hinterlegten Tools gewählt ist — seit V2.0.0 bewusst schon vor
// einer abgeschlossenen Analyse aufrufbar (siehe buildTradeToolQuery unten
// und "Sofort klickbar ohne Diagnose"). Bei "Allround-Handwerker" wird die
// Vereinigung aller Listen gezeigt (siehe currentTradeTools in der
// App-Komponente).
// Baut die Nutzer-Query für ein Berufs-Spezial-Tool: nutzt die konkreteste
// verfügbare Grundlage — abgeschlossene Diagnose > Problembeschreibung > nur
// der gewählte Beruf —, da die Tools schon direkt nach der Berufswahl
// klickbar sind, lange bevor (oder auch ohne dass) eine Analyse existiert.
const buildTradeToolQuery = (topicPrompt, { solutionText, problemDescription, selectedTrade }) => {
if (solutionText) return `${topicPrompt} Konkrete Lösung: ${solutionText}`;
if (problemDescription) return `${topicPrompt} Problembeschreibung: ${problemDescription}`;
return `${topicPrompt} Es liegt noch keine konkrete Diagnose oder Problembeschreibung vor — gib allgemeine, praxisnahe Hinweise für den Beruf ${selectedTrade}.`;
};
const TRADE_TOOLS = {
"Klempner": [
{
id: "klempner-trinkwv",
label: "Trinkwasserverordnung-Check",
icon: Droplets,
systemInstruction: "Du bist ein Experte für die deutsche Trinkwasserverordnung (TrinkwV) und die einschlägigen DIN-Normen der Sanitärinstallation. Prüfe die gegebene Grundlage auf Konformität, nenne die relevanten Normen/Vorschriften und mögliche Stolperfallen. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Prüfe auf Normkonformität (Trinkwasserverordnung/DIN).", ctx),
},
{
id: "klempner-normteile",
label: "Normteile-Finder",
icon: Search,
systemInstruction: "Du bist ein erfahrener SHK-Großhändler. Liste die benötigten genormten Verbindungs- und Dichtungsteile (z.B. Übergangsstücke, Dichtringe, Verschraubungen) mit kurzer Begründung auf. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Welche Normteile werden benötigt?", ctx),
},
],
"Elektriker": [
{
id: "elektriker-vde",
label: "VDE-Vorschriften-Check",
icon: Zap,
systemInstruction: "Du bist ein Elektromeister und Prüfsachverständiger für die einschlägigen VDE-Normen (z.B. VDE 0100). Prüfe die gegebene Grundlage auf Normkonformität und nenne relevante Vorschriften sowie Prüfpflichten. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Prüfe auf VDE-Konformität.", ctx),
},
{
id: "elektriker-querschnitt",
label: "Sicherungs-/Querschnitt-Rechner",
icon: Calculator,
systemInstruction: "Du bist ein Elektroplaner. Empfehle passende Leitungsquerschnitte und Sicherungsauslegung (Absicherung, Kabeltyp) inklusive kurzer Begründung. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Empfehle einen passenden Leitungsquerschnitt und die Absicherung.", ctx),
},
],
"Maler": [
{
id: "maler-mengenrechner",
label: "Farbmengen-Rechner",
icon: Calculator,
systemInstruction: "Du bist ein Malermeister mit Erfahrung in der Materialkalkulation. Schätze den ungefähren Farb-/Materialbedarf (Liter pro m², Gebindegrößen) und nenne die getroffenen Annahmen. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Schätze den Farbmengenbedarf.", ctx),
},
{
id: "maler-trocknung",
label: "Trocknungszeiten & Wetterfenster",
icon: CloudRain,
systemInstruction: "Du bist ein Malermeister. Nenne typische Trocknungs-/Zwischentrocknungszeiten sowie ideale Witterungsbedingungen (Temperatur, Luftfeuchtigkeit) für die Ausführung. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Nenne Trocknungszeiten und ideale Witterungsbedingungen.", ctx),
},
],
"Gärtner": [
{
id: "gaertner-bestimmung",
label: "Pflanzen- & Schädlingscheck",
icon: Bug,
systemInstruction: "Du bist ein Gärtnermeister mit Schwerpunkt Pflanzenschutz. Identifiziere anhand der gegebenen Grundlage mögliche Pflanzenarten, Schädlinge oder Krankheitsbilder und schlage Gegenmaßnahmen vor. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Identifiziere die Pflanze bzw. den Schädling und schlage Gegenmaßnahmen vor.", ctx),
},
{
id: "gaertner-pflegekalender",
label: "Pflege- & Schnittkalender",
icon: Scissors,
systemInstruction: "Du bist ein Gärtnermeister. Erstelle einen kurzen saisonalen Pflege- und Schnittkalender mit den wichtigsten Zeitfenstern. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Erstelle einen passenden Pflege-/Schnittkalender.", ctx),
},
],
"Zimmerer": [
{
id: "zimmerer-holzart",
label: "Holzart-Empfehlung",
icon: TreePine,
systemInstruction: "Du bist ein Zimmerermeister. Empfehle eine geeignete Holzart (inkl. Holzschutzklasse falls relevant) mit kurzer Begründung. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Empfehle eine passende Holzart.", ctx),
},
{
id: "zimmerer-holzmenge",
label: "Holzmengen-Schätzung",
icon: Ruler,
systemInstruction: "Du bist ein Zimmerermeister mit Erfahrung in der Materialkalkulation. Schätze grob den Holzmengenbedarf (lfm/m³) inklusive der getroffenen Annahmen. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Schätze den Holzmengenbedarf.", ctx),
},
],
"Mechaniker": [
{
id: "mechaniker-fehlercode",
label: "Fehlercode-/Symptom-Lookup",
icon: Search,
systemInstruction: "Du bist ein Kfz-Meister mit Diagnoseerfahrung. Ordne typische Fehlercodes bzw. Symptome zu und erkläre mögliche Ursachenketten. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Ordne typische Fehlercodes/Symptome zu.", ctx),
},
{
id: "mechaniker-ersatzteil",
label: "Ersatzteil-Sucher",
icon: Wrench,
systemInstruction: "Du bist ein Kfz-Teiledienst-Berater. Liste die typischerweise benötigten Ersatzteile mit kurzer Beschreibung auf. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Welche Ersatzteile werden typischerweise benötigt?", ctx),
},
],
"Maurer": [
{
id: "maurer-mengenrechner",
label: "Mörtel-/Beton-Mengenrechner",
icon: Calculator,
systemInstruction: "Du bist ein Maurermeister mit Erfahrung in der Materialkalkulation. Schätze den ungefähren Mörtel-/Betonbedarf inklusive Mischungsverhältnis. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Schätze den Mörtel-/Betonbedarf.", ctx),
},
{
id: "maurer-statik",
label: "Statik-Hinweise",
icon: Layers,
systemInstruction: "Du bist ein Maurermeister. Weise auf mögliche statisch relevante Aspekte hin und nenne, wann ein Statiker hinzugezogen werden sollte. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Nenne statisch relevante Hinweise.", ctx),
},
],
"Dachdecker": [
{
id: "dachdecker-material",
label: "Dachneigung-/Material-Eignung",
icon: HardHat,
systemInstruction: "Du bist ein Dachdeckermeister. Beurteile, welche Dacheindeckungsmaterialien geeignet sind und ab welcher Dachneigung sie zulässig sind. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Beurteile geeignete Dachmaterialien und Neigungsgrenzen.", ctx),
},
{
id: "dachdecker-wetterfenster",
label: "Wetterfenster-Empfehlung",
icon: CloudRain,
systemInstruction: "Du bist ein Dachdeckermeister. Nenne ideale Witterungsbedingungen und Zeitfenster für die Ausführung sowie Risiken bei ungünstigem Wetter. Antworte im Markdown-Format.",
buildQuery: (ctx) => buildTradeToolQuery("Nenne ein geeignetes Wetterfenster.", ctx),
},
],
};
// Flache Liste aller Berufs-Spezial-Tools über alle Berufe hinweg (statisch,
// einmal beim Modul-Laden berechnet) — ermöglicht, ein Tool-Ergebnis anhand
// seiner ID nachzuschlagen, auch wenn der aktuell gewählte Beruf ein anderer
// ist als der, zu dem das Tool ursprünglich gehört (siehe ALL_TRADE_TOOL_RESULTS
// in der App-Komponente: Ergebnisse bleiben beim Berufswechsel sichtbar,
// statt beim Wechsel weg vom ursprünglichen Beruf zu verschwinden).
const ALL_TRADE_TOOLS = Object.values(TRADE_TOOLS).flat();
// Ordnet jeder Tool-ID ihren ursprünglichen Beruf zu — für die Akzentfarbe
// und das Herkunfts-Label, wenn ein Tool-Ergebnis nach einem Berufswechsel
// weiterhin angezeigt wird (siehe tradeToolResultEntries).
const TRADE_TOOL_ORIGIN = Object.fromEntries(
Object.entries(TRADE_TOOLS).flatMap(([trade, tools]) => tools.map((tool) => [tool.id, trade]))
);
/**
* Funktion zur Konvertierung einer Datei in Base64 (wird für die API benötigt).
* Skaliert dabei über Canvas auf max. 1600px Kantenlänge herunter und
* kodiert als JPEG neu, weil Vercel-Serverless-Functions (/api/gemini) ein
* hartes, nicht konfigurierbares Payload-Limit von 4,5MB haben — unkomprimierte
* Handyfotos (oft 5-12MB) sprengen das nach Base64-Inflation (+33%) zuverlässig
* (siehe error_log.md, FUNCTION_PAYLOAD_TOO_LARGE).
*/
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_JPEG_QUALITY = 0.82;
const fileToBase64 = (file) => {
return new Promise((resolve, reject) => {
const reader = new FileReader();
reader.readAsDataURL(file);
reader.onload = () => {
const img = new window.Image();
img.onload = () => {
let { width, height } = img;
if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
width = Math.round(width * scale);
height = Math.round(height * scale);
}
const canvas = document.createElement('canvas');
canvas.width = width;
canvas.height = height;
canvas.getContext('2d').drawImage(img, 0, 0, width, height);
resolve(canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY).split(',')[1]);
};
img.onerror = () => reject(new Error('Bild konnte nicht dekodiert werden.'));
img.src = reader.result;
};
reader.onerror = (error) => reject(error);
});
};
// Kurzer "Bling"-Ton als akustischer Hinweis, dass die Analyse fertig ist
// (z.B. wenn man während der Wartezeit den Tab gewechselt hat). Web Audio
// API statt Audio-Datei, damit kein zusätzliches Asset benötigt wird.
const playCompletionSound = () => {
try {
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContextClass();
const now = ctx.currentTime;
[1046.5, 1568].forEach((freq, i) => {
const oscillator = ctx.createOscillator();
const gain = ctx.createGain();
oscillator.type = 'sine';
oscillator.frequency.value = freq;
const start = now + i * 0.09;
gain.gain.setValueAtTime(0, start);
gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
oscillator.connect(gain);
gain.connect(ctx.destination);
oscillator.start(start);
oscillator.stop(start + 0.5);
});
setTimeout(() => ctx.close(), 700);
} catch {
// Web Audio nicht verfügbar -> Ton einfach auslassen
}
};
/**
* Funktion mit Exponential Backoff für API-Anrufe, um Throttling zu behandeln.
* maxRetries=5 mit auf 8s gedeckeltem Backoff (Summe ~15s Wartezeit vor dem
* letzten Versuch): Gemini liefert bei Überlastung ("model is currently
* experiencing high demand") ein 5xx, das sich in der Praxis nach wenigen
* Sekunden bis niedrigen zehner Sekunden von selbst löst — ein manueller
* Retry durch den Nutzer war bereits erfolgreich, das soll jetzt automatisch
* passieren statt sofort einen Fehler anzuzeigen.
*/
const MAX_RETRY_DELAY_MS = 8000;
const fetchWithRetry = async (url, options, maxRetries = 5) => {
let requestOptions = options;
if ((url === apiUrl || url === trialStatusUrl || url === apiTtsUrl || url === appStartUrl) && appCheckInstance) {
try {
const { token } = await getAppCheckToken(appCheckInstance);
requestOptions = { ...options, headers: { ...options.headers, 'X-Firebase-AppCheck': token } };
} catch (e) {
console.error('App-Check-Token konnte nicht geholt werden:', e);
// Bisher landete dieser Fehler nur in der Browser-Konsole — für den Admin
// unsichtbar, obwohl er jede nachfolgende API-Anfrage mit 401 scheitern
// lässt. queueErrorReport() feuert intern sofort sendBugReportEmail()
// (fire-and-forget); der Firestore-Eintrag fürs Admin Panel wird beim
// nächsten flushErrorReports()-Aufruf mitgeschickt (z.B. aus dem
// catch-Block der aufrufenden API-Funktion, der wegen des fehlenden
// Tokens ohnehin gleich danach greift).
queueErrorReport('app-check-token', e);
}
}
if ((url === apiUrl || url === trialStatusUrl || url === appStartUrl) && currentAuthInstance?.currentUser) {
try {
const idToken = await getIdToken(currentAuthInstance.currentUser);
requestOptions = { ...requestOptions, headers: { ...requestOptions.headers, Authorization: `Bearer ${idToken}` } };
} catch {
// ID-Token ist optional: bei apiUrl ändert ein fehlendes Token nichts am
// normalen Demo-Kontingent-Verhalten (nur der Admin-Claim bleibt
// unerkannt); bei appStartUrl wird der Start dann ohne UID geloggt (siehe
// api/app-start.js) — beides darf die jeweilige Anfrage nicht blockieren.
}
}
for (let i = 0; i < maxRetries; i++) {
try {
const response = await fetch(url, requestOptions);
// Nur 5xx (Serverfehler) automatisch wiederholen. 429 (Rate-Limit) bewusst NICHT:
// unser eigener Rate-Limiter (api/gemini.js) zählt in einem 60s-Fenster — die paar
// Sekunden Backoff hier ändern daran nichts, ein Retry würde also garantiert wieder
// scheitern (und den Verbrauch des Fensters durch mehrere Aufrufer sogar verschärfen).
// Response bei 429/4xx wird direkt zurückgegeben, damit der Aufrufer die
// Klartext-Fehlermeldung aus dem Response-Body lesen kann.
if (!response.ok && response.status >= 500 && i < maxRetries - 1) {
const delay = Math.min(Math.pow(2, i) * 1000, MAX_RETRY_DELAY_MS);
await new Promise(resolve => setTimeout(resolve, delay));
continue;
}
return response;
} catch (error) {
// Netzwerkfehler (fetch selbst wirft, kein HTTP-Status vorhanden) sind behebbar
if (i === maxRetries - 1) {
throw error;
}
// Exponentieller Backoff, gedeckelt auf MAX_RETRY_DELAY_MS
const delay = Math.min(Math.pow(2, i) * 1000, MAX_RETRY_DELAY_MS);
await new Promise(resolve => setTimeout(resolve, delay));
}
}
};
// Liest die Fehlermeldung aus einer /api/gemini-Fehlerantwort. Eigene
// Server-Fehler (api/gemini.js) liefern {"error": "Text"} als String — von
// Gemini durchgereichte Upstream-Fehler (Passthrough im selben Handler)
// kommen dagegen im Google-API-Format {"error": {"code":…, "message":"…",
// "status":"…"}} als OBJEKT. Ohne diese Unterscheidung landete das rohe
// Objekt in new Error(...) und wurde zu "[object Object]" stringifiziert
// (siehe error_log.md).
const extractApiErrorMessage = (responseText, fallback) => {
try {
const err = JSON.parse(responseText)?.error;
if (typeof err === 'string') return err;
if (err && typeof err === 'object') return err.message || JSON.stringify(err);
return fallback;
} catch {
// kein JSON (z.B. Netzwerkfehler-Text) -> Fallback (i.d.R. der Rohtext)
return fallback;
}
};
// Komponente für einen einzelnen Handwerker-Button
// Nutzt eine per Button gesetzte CSS-Variable statt fixer Tailwind-Farbklassen,
// damit Fläche/Hover/Ring aus der gedeckten TRADE_THEMES-Palette kommen und
// sich beim Wechsel des Berufs weich (transition-colors) einblenden.
const TradeButton = ({ name, icon: Icon, theme, isSelected, onClick }) => (
<button
onClick={() => onClick(name)}
style={{ '--tbtn-bg': theme.accent, '--tbtn-bg-hover': theme.accentDark }}
className={`flex flex-col items-center justify-center p-2 rounded-2xl transition-colors duration-500 ease-in-out shadow-lg transform active:scale-[0.98] border-2
bg-(--tbtn-bg) hover:bg-(--tbtn-bg-hover) text-white
${isSelected ? 'border-gold ring-2 ring-offset-2 ring-offset-parchment ring-gold shadow-2xl' : 'border-black/10 opacity-90 hover:opacity-100'}
`}
>
<div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white/30 mb-1">
<Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
</div>
<span className="text-white text-[10px] sm:text-xs font-semibold text-center mt-1">{name}</span>
</button>
);
// NEUE Komponente: Historische Analysen anzeigen (liest aus Firestore)
const AnalysisHistoryModal = ({ db, userId, appId, onClose, onSelect }) => {
const [history, setHistory] = useState([]);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
const fetchHistory = useCallback(async () => {
if (!db || !userId) {
setError('Benutzer ist nicht authentifiziert oder Datenbank nicht bereit.');
setIsLoading(false);
return;
}
setIsLoading(true);
setError(null);
try {
// Korrekter Pfad für private Benutzerdaten
const analysesCol = collection(db, 'artifacts', appId, 'users', userId, 'analyses');
// Abfrage der letzten 20 Analysen, sortiert nach Zeitstempel
const q = query(
analysesCol,
orderBy('timestamp', 'desc'),
limit(20)
);
const querySnapshot = await getDocs(q);
const loadedHistory = [];
querySnapshot.forEach((doc) => {
loadedHistory.push({ id: doc.id, ...doc.data() });
});
setHistory(loadedHistory);
} catch (e) {
console.error("Fehler beim Laden der Historie:", e);
queueErrorReport('load-history-api', e);
flushErrorReports(db, userId, appId);
setError("Fehler beim Laden der Analyse-Historie: " + e.message);
} finally {
setIsLoading(false);
}
}, [db, userId, appId]);
useEffect(() => {
fetchHistory();
}, [fetchHistory]);
return (
<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
<div
className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md h-[80vh] flex flex-col transform transition-all duration-300 scale-100"
onClick={e => e.stopPropagation()}
>
<div className="flex justify-between items-center border-b pb-3 mb-4 flex-shrink-0">
<h3 className="text-xl font-bold text-gray-800 flex items-center">
<List className="w-5 h-5 mr-2 text-blue-600" />
Ihre Analyse-Historie
</h3>
<button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-light"><X className="w-6 h-6" /></button>
</div>
{isLoading ? (
<div className="flex items-center justify-center flex-grow">
<Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
<p className="ml-2 text-gray-600">Historie wird geladen...</p>
</div>
) : error ? (
<div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg">
<p className="text-sm">{error}</p>
</div>
) : history.length === 0 ? (
<div className="text-center p-8 text-gray-500 flex-grow">
<FileText className="w-8 h-8 mx-auto mb-3" />
<p>Noch keine Analysen gespeichert. Starten Sie jetzt Ihre erste Analyse!</p>
</div>
) : (
<ul className="space-y-3 overflow-y-auto flex-grow pr-1">
{history.map((item) => (
<li
key={item.id}
className="p-3 bg-gray-50 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100 transition duration-150 cursor-pointer flex items-center justify-between"
onClick={() => onSelect(item)} // Ladefunktion wird bei Klick ausgelöst
>
<div>
<p className="text-xs text-gray-500">
{item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleString('de-DE') : 'Unbekanntes Datum'}
</p>
<p className="text-sm font-semibold text-gray-800 truncate max-w-[80%]">
{item.problemDescription.trim() || `Analyse für Beruf: ${item.selectedTrade}`}
</p>
<span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
{item.selectedTrade}
</span>
</div>
<button className='flex items-center text-blue-600 hover:text-blue-800 text-sm font-semibold flex-shrink-0'>
Laden
</button>
</li>
))}
</ul>
)}
<div className="text-center mt-4 flex-shrink-0">
<p className="text-xs text-gray-400">Zeigt die letzten 20 Analysen.</p>
</div>
</div>
</div>
);
};
// ** ZURÜCKGESETZTE/VEREINFACHTE SVG-KOMPONENTE MIT LUCIDE-ICONS **
// Offizielles Google "G"-Logo (mehrfarbig) für den "Mit Google anmelden"-Button —
// gibt es nicht als lucide-react-Icon, daher als eigenes Inline-SVG.
const GoogleIcon = ({ className }) => (
<svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
<path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
<path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
<path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
</svg>
);
const SmarterCraftLogo = ({ onClick }) => (
<button
type="button"
onClick={onClick}
title="Eingaben zurücksetzen"
className="appearance-none block relative w-10 h-10 p-0 m-0 leading-none rounded-full focus:outline-none focus:ring-2 focus:ring-white/70"
>
{/* Basis: Hammer */}
<Hammer className="absolute inset-0 w-full h-full text-white/90" />
{/* Overlay: Blitz (Smart-Aspekt), leicht versetzt und hervorgehoben */}
<Zap className="absolute w-5 h-5 bottom-0 right-0 transform translate-x-1 translate-y-1 text-gold-light fill-gold-light shadow-md" />
</button>
);
// Aufgeraeumter, polierter Look fuer die Kopfleiste: sanfter Glanzstreifen
// plus eine gerade Akzentlinie an der Unterkante statt der frueheren
// Rost-/Oelfleck-/Kratzer-Texturen. Liegt als reines Deko-Overlay
// (absolute inset-0, keine eigene Fuellung) UEBER dem bestehenden
// .header-ornate-Hintergrund, damit an keiner Stelle Transparenz
// durchscheint, egal wie breit/hoch der Header gerade ist.
const HeaderPlate = () => (
<svg
className="absolute inset-0 w-full h-full pointer-events-none"
viewBox="0 0 1000 100"
preserveAspectRatio="none"
aria-hidden="true"
>
<defs>
<linearGradient id="headerGloss" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
<stop offset="40%" stopColor="#ffffff" stopOpacity="0" />
<stop offset="47%" stopColor="#ffffff" stopOpacity="0.16" />
<stop offset="51%" stopColor="#ffffff" stopOpacity="0.04" />
<stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
<stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
</linearGradient>
<linearGradient id="headerGoldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" stopColor="#6fb1e8" />
<stop offset="100%" stopColor="#3d7fb8" />
</linearGradient>
</defs>

{/* dezenter diagonaler Glanzstreifen für einen polierten Schimmer */}
<rect width="1000" height="100" fill="url(#headerGloss)" style={{ mixBlendMode: 'overlay' }} />

{/* gerade Akzentlinie an der Unterkante statt frueherem ausgefransten Rand */}
<rect x="0" y="96" width="1000" height="3" fill="url(#headerGoldGrad)" />
</svg>
);
// Extrahiert die für die Profil-UI relevanten Felder aus einem Firebase-User.
// Zwei Gründe, warum das nicht einfach `user` selbst sein kann:
// 1. Nach linkWithPopup() (anonym -> Google) bleiben displayName/email/photoURL
//    auf dem User-Root-Objekt teils leer — die eigentlichen Werte stehen dann
//    nur in providerData[]. Fällt hier explizit darauf zurück.
// 2. Firebase mutiert das User-Objekt teils in-place und liefert bei erneuten
//    onAuthStateChanged-Aufrufen dieselbe Objektreferenz zurück — ein reines
//    setAuthUser(user) würde React dann per Object.is-Vergleich keinen Re-Render
//    auslösen lassen, obwohl sich z.B. das Foto geändert hat. Ein frisches
//    Plain-Object umgeht das zuverlässig.
const toAuthUserSnapshot = (user) => {
if (!user) return null;
const googleProvider = user.providerData?.find((p) => p.providerId === 'google.com');
return {
uid: user.uid,
isAnonymous: user.isAnonymous,
displayName: user.displayName || googleProvider?.displayName || null,
email: user.email || googleProvider?.email || null,
photoURL: user.photoURL || googleProvider?.photoURL || null,
};
};
const App = () => {
// --- Firebase States ---
const [db, setDb] = useState(null);
const [auth, setAuth] = useState(null);
const [userId, setUserId] = useState(null);
// Voller Auth-User (Firebase User-Objekt): liefert displayName/email/photoURL
// für Profil-UI und Fehlerreport-Zuordnung (Google-Login ist verpflichtend,
// isAnonymous ist für jeden User in userId/authUser daher immer false).
const [authUser, setAuthUser] = useState(null);
const [isAuthReady, setIsAuthReady] = useState(false);
// true, solange kein per Google angemeldeter Nutzer vorliegt — steuert die
// Login-Gate-Ansicht (siehe "if (!isAuthReady || showAuth)" weiter unten).
const [showAuth, setShowAuth] = useState(false);
const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
const [googleSignInError, setGoogleSignInError] = useState(null);
const [showHistory, setShowHistory] = useState(false); // Steuert das Historien-Modal
const [showAdmin, setShowAdmin] = useState(false); // Steuert das Admin-Modal (Fehlerreports)
const [showLegal, setShowLegal] = useState(false); // Steuert das Impressum/Datenschutz-Modal
const [showFeedback, setShowFeedback] = useState(false); // Steuert das Feedback-Modal
// Steuert die Schritt-für-Schritt-Anleitung zum Hinterlegen eines eigenen
// Gemini-API-Keys — öffnet sich automatisch, sobald eine KI-Anfrage mit
// Status 402 (Kontingent aufgebraucht, kein eigener Key, siehe
// api/gemini.js) scheitert, statt dass der Nutzer die Profil-Einstellung
// selbst suchen muss (siehe handleTrialExceededError unten).
const [showApiKeyOnboarding, setShowApiKeyOnboarding] = useState(false);
// Muss vor allen callGemini*API-Funktionen stehen, die sie in ihrer
// useCallback-Deps-Liste referenzieren — sonst TDZ-Fehler beim Rendern
// (const-Deklarationen sind nicht hoisted). Nutzt nur stabile State-Setter,
// daher leeres Deps-Array.
const handleTrialExceededError = useCallback((message) => {
setError(message);
setShowApiKeyOnboarding(true);
}, []);
// Echter Admin-Status (Firebase Custom Claim "admin: true", siehe
// scripts/set-admin-claim.mjs + api/gemini.js), kein UI-Sichtschutz mehr —
// AdminPanel.jsx verlässt sich hierauf statt auf einen PIN.
const [isAdmin, setIsAdmin] = useState(false);
const [showDisclaimer, setShowDisclaimer] = useState(true); // EU-AI-Act-Haftungsausschluss wegklickbar (pro Sitzung)
const [showTrialNotice, setShowTrialNotice] = useState(true); // Hinweis aufs Pro-Konto-Kontingent wegklickbar (pro Sitzung)
// Live-Stand des kostenlosen Pro-Konto-Kontingents (siehe api/gemini.js
// FREE_TRIAL_MAX) — null solange unbekannt (noch nicht geladen bzw. Tracking
// serverseitig aus), dann Zahl der noch übrigen kostenlosen Analysen.
const [trialRemaining, setTrialRemaining] = useState(null);
// Vom Nutzer selbst hinterlegter Gemini-API-Key (Firestore-Profil, siehe
// loadProfile-Effect unten) — leerer String, solange keiner gespeichert ist.
const [ownApiKey, setOwnApiKey] = useState('');
// --- App States ---
const [selectedImageBase64, setSelectedImageBase64] = useState(null);
const [problemDescription, setProblemDescription] = useState('');
const [solutionText, setSolutionText] = useState(null);
const [sources, setSources] = useState([]);
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [error, setError] = useState(null);
const [selectedTrade, setSelectedTradeState] = useState('Allround-Handwerker');
// App-weites Farbthema: folgt dem gewählten Beruf (gedeckte Töne, siehe
// TRADE_THEMES). Header, CTAs und Akzent-Icons lesen diese CSS-Variablen;
// zusammen mit transition-colors ergibt sich beim Berufswechsel ein weicher
// Farbwechsel statt eines harten Umschaltens.
const theme = useMemo(
() => TRADE_THEMES[selectedTrade] || TRADE_THEMES[DEFAULT_TRADE],
[selectedTrade]
);
// --- LLM Feature States ---
const [materialList, setMaterialList] = useState(null);
const [safetyTips, setSafetyTips] = useState(null);
const [videoLinks, setVideoLinks] = useState(null);
const [clientReport, setClientReport] = useState(null);
const [isGeneratingMaterials, setIsGeneratingMaterials] = useState(false);
const [isGeneratingSafety, setIsGeneratingSafety] = useState(false);
const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
const [isGeneratingReport, setIsGeneratingReport] = useState(false);
// Berufs-spezifische KI-Tools (TRADE_TOOLS): Ergebnisse/Ladezustand pro
// Tool-ID statt einzelner States, da die Anzahl der Tools pro Beruf variiert.
const [tradeToolResults, setTradeToolResults] = useState({});
const [loadingTradeToolIds, setLoadingTradeToolIds] = useState({});
// Bei "Allround-Handwerker" werden alle Berufs-Tools zusammen angezeigt.
const currentTradeTools = useMemo(
() => selectedTrade === 'Allround-Handwerker'
? Object.values(TRADE_TOOLS).flat()
: (TRADE_TOOLS[selectedTrade] || []),
[selectedTrade]
);
// Ergebnisse aller Berufs-Spezial-Tools, unabhängig vom aktuell gewählten
// Beruf — anders als currentTradeTools (nur die Buttons des aktuellen
// Berufs) bleiben so schon erzeugte Ergebnisse beim Berufswechsel weiter
// sichtbar, statt zu verschwinden ("Ergebnisse verschiedener Berufe
// stapeln, völlig flexibel bleiben").
const tradeToolResultEntries = useMemo(
() => ALL_TRADE_TOOLS
.map((tool) => ({ tool, text: tradeToolResults[tool.id], trade: TRADE_TOOL_ORIGIN[tool.id] }))
.filter((entry) => entry.text),
[tradeToolResults]
);
// --- TTS (Sprachausgabe) States ---
// Läuft über einen serverseitigen Proxy (api/tts.js) zur Google Cloud
// Text-to-Speech API statt über die Web Speech API des Browsers — die
// browsereigene Lösung erwies sich als unzuverlässig (Abbrüche, gemeldete
// Stimmen ohne Tonausgabe, kein echter Geschlechtsunterschied). Ein
// <audio>-Element spielt die vom Server gelieferten MP3-Dateien ab.
const [isTtsPlaying, setIsTtsPlaying] = useState(false);
const [isTtsLoading, setIsTtsLoading] = useState(false);
const audioRef = useRef(null);
// Bereits erzeugte Audiodaten (Object-URLs) je Modus+Geschlecht cachen, damit
// erneutes Abspielen keine erneute (kostenpflichtige) TTS-Anfrage auslöst.
const ttsAudioCacheRef = useRef({});
const [ttsGender, setTtsGender] = useState(() => {
try {
return localStorage.getItem('smartcraft-tts-gender') === 'female' ? 'female' : 'male';
} catch {
return 'male';
}
});
// 'short' liest nur die wichtigsten Punkte vor (KI-generierte Zusammenfassung),
// 'full' den kompletten Diagnosetext. Standard ist die kurze Version.
const [ttsMode, setTtsMode] = useState(() => {
try {
return localStorage.getItem('smartcraft-tts-mode') === 'full' ? 'full' : 'short';
} catch {
return 'short';
}
});
const [ttsShortText, setTtsShortText] = useState(null);
const [isGeneratingTtsShort, setIsGeneratingTtsShort] = useState(false);
useEffect(() => {
try {
localStorage.setItem('smartcraft-tts-gender', ttsGender);
} catch {
// localStorage kann in privaten/eingeschränkten Kontexten fehlen — Einstellung bleibt dann nur für die Sitzung
}
}, [ttsGender]);
useEffect(() => {
try {
localStorage.setItem('smartcraft-tts-mode', ttsMode);
} catch {
// localStorage kann in privaten/eingeschränkten Kontexten fehlen — Einstellung bleibt dann nur für die Sitzung
}
}, [ttsMode]);
const clearTtsAudioCache = useCallback(() => {
Object.values(ttsAudioCacheRef.current).flat().forEach((url) => URL.revokeObjectURL(url));
ttsAudioCacheRef.current = {};
}, []);
// Neue Diagnose eingetroffen — eine zuvor generierte Kurzfassung bzw. bereits
// synthetisierte Audiodaten gehören zum alten Text
useEffect(() => {
setTtsShortText(null);
clearTtsAudioCache();
}, [solutionText, clearTtsAudioCache]);
// Laufende Sprachausgabe beim Verlassen der Seite/Komponente stoppen —
// sowohl Premium-Audio (<audio>-Element) als auch Browser-TTS, je nachdem
// welche Engine gerade lief.
useEffect(() => {
return () => {
audioRef.current?.pause();
if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
clearTtsAudioCache();
};
}, [clearTtsAudioCache]);
// Manche Browser (v.a. Chrome) laden Stimmen asynchron nach — einmaliges
// frühes Anstoßen von getVoices() sorgt dafür, dass pickBrowserVoice() beim
// ersten Klick auf "Vorlesen" schon eine volle Stimmenliste sieht, statt nur
// die (oft leere) Sofort-Antwort.
useEffect(() => {
if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.getVoices();
}, []);
// Markdown-Reste (Sternchen, Rauten, Aufzählungsstriche) vor dem Vorlesen entfernen
const stripMarkdownForTts = (text) => text
.replace(/[*_#`]/g, '')
.replace(/^-\s+/gm, '')
.replace(/\n{2,}/g, '. ')
.replace(/\n/g, ' ');
const base64ToBlobUrl = (base64) => {
const binary = atob(base64);
const bytes = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
};
// Spielt eine Folge von Audio-URLs nacheinander über dasselbe <audio>-Element ab.
const playAudioQueue = useCallback((urls) => {
const audio = audioRef.current;
if (!audio || urls.length === 0) {
setIsTtsPlaying(false);
return;
}
let index = 0;
const playNext = () => {
if (index >= urls.length) {
setIsTtsPlaying(false);
return;
}
audio.src = urls[index];
index += 1;
audio.play().catch(() => setIsTtsPlaying(false));
};
audio.onended = playNext;
audio.onerror = () => setIsTtsPlaying(false);
setIsTtsPlaying(true);
playNext();
}, []);
const fetchTtsAudio = useCallback(async (text) => {
// Premium-TTS erfordert ein angemeldetes Google-Konto (siehe api/tts.js) —
// dafür muss das Firebase-ID-Token des eingeloggten Nutzers mitgeschickt
// werden, nicht nur der App-Check-Nachweis.
const idToken = auth?.currentUser ? await getIdToken(auth.currentUser).catch(() => null) : null;
const response = await fetchWithRetry(apiTtsUrl, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
},
body: JSON.stringify({ text: stripMarkdownForTts(text), gender: ttsGender }),
});
const responseText = await response.text();
if (!response.ok || !responseText) {
const err = new Error(responseText || `TTS-API-Fehler mit Status: ${response.status}`, { cause: response.status });
// Kontingent-/Rate-Limit-Antworten tragen einen "code" im JSON-Body (siehe
// api/tts.js) — erlaubt speakText, erwartete von unerwarteten Fehlern zu
// unterscheiden, ohne den Body ein zweites Mal zu parsen.
try { err.code = JSON.parse(responseText)?.code; } catch { /* kein JSON, z.B. Netzwerkfehlertext */ }
throw err;
}
const data = JSON.parse(responseText);
if (!data.audioChunks?.length) throw new Error('Leere Antwort von der TTS-API.');
return data.audioChunks.map(base64ToBlobUrl);
}, [ttsGender, auth]);
const pickBrowserVoice = useCallback((gender) => {
if (typeof window === 'undefined' || !window.speechSynthesis) return null;
const germanVoices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('de'));
const hints = gender === 'female' ? FEMALE_VOICE_HINTS : MALE_VOICE_HINTS;
const byGender = germanVoices.find((v) => hints.some((hint) => v.name.toLowerCase().includes(hint)));
return byGender || germanVoices[0] || null;
}, []);
// Browsereigene Sprachausgabe (Web Speech API) — kostenlos, ohne Server-
// Roundtrip. Dient als garantierter Fallback, wenn Premium-TTS aus
// irgendeinem Grund nicht verfügbar ist (Kontingent voll, Rate-Limit,
// Server-Fehler) — siehe speakText. Damit gibt es nie eine Sackgasse ohne Audio.
const speakWithBrowserTts = useCallback((text) => {
if (typeof window === 'undefined' || !window.speechSynthesis) {
// Einziger tatsächlicher Dead-End: Browser ohne Web Speech API.
queueErrorReport('browser-tts-unsupported', new Error('Web Speech API nicht verfügbar'));
flushErrorReports(db, userId, appId);
setError('Sprachausgabe wird von diesem Browser nicht unterstützt.');
return;
}
window.speechSynthesis.cancel();
const utterance = new SpeechSynthesisUtterance(stripMarkdownForTts(text));
utterance.lang = 'de-DE';
const voice = pickBrowserVoice(ttsGender);
if (voice) utterance.voice = voice;
utterance.onstart = () => setIsTtsPlaying(true);
utterance.onend = () => setIsTtsPlaying(false);
utterance.onerror = () => setIsTtsPlaying(false);
window.speechSynthesis.speak(utterance);
}, [ttsGender, pickBrowserVoice, db, userId, appId]);
// Stoppt Wiedergabe unabhängig davon, welche der beiden Engines gerade läuft.
const stopSpeaking = useCallback(() => {
audioRef.current?.pause();
if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
setIsTtsPlaying(false);
}, []);
const speakText = useCallback(async (text) => {
const cacheKey = `${ttsMode}:${ttsGender}`;
const cached = ttsAudioCacheRef.current[cacheKey];
if (cached) {
playAudioQueue(cached);
return;
}
setIsTtsLoading(true);
try {
const urls = await fetchTtsAudio(text);
ttsAudioCacheRef.current[cacheKey] = urls;
playAudioQueue(urls);
} catch (e) {
// Premium-TTS fehlgeschlagen (Kontingent erreicht, Rate-Limit, Server-
// Fehler, ...) — ohne Fehlermeldung auf die Browser-Stimme umschalten,
// damit immer Audio verfügbar ist.
console.warn('Premium-TTS nicht verfügbar, Fallback auf Browser-Stimme:', e);
// Kontingent voll ("quota_exceeded") oder eigenes IP-Rate-Limit
// ("rate_limited", beide von api/tts.js mit "code" markiert) sind erwartete
// Fälle, kein Bug. Wichtig: NICHT anhand von e.cause === 429 filtern — ein
// 429 kann auch von der Google-Cloud-TTS-API selbst kommen (z.B. Billing/
// Kontingent-Problem dort, siehe error_log.md #5 für dasselbe Muster bei
// Gemini) und wird ohne "code" durchgereicht. Nur explizit markierte,
// erwartete Fälle bleiben unauffällig — alles andere landet im Admin-Report.
if (e.code !== 'quota_exceeded' && e.code !== 'rate_limited') {
queueErrorReport('google-tts-api', e);
flushErrorReports(db, userId, appId);
}
speakWithBrowserTts(text);
} finally {
setIsTtsLoading(false);
}
}, [ttsMode, ttsGender, fetchTtsAudio, playAudioQueue, speakWithBrowserTts, db, userId]);
// Erstellt bei Bedarf eine KI-Kurzfassung der Diagnose (nur die wichtigsten
// Punkte) und liest sie vor; das Ergebnis wird für den aktuellen Diagnosetext
// zwischengespeichert, damit nicht bei jedem Abspielen erneut angefragt wird.
const callGeminiTtsSummaryAPI = useCallback(async () => {
setIsGeneratingTtsShort(true);
const payload = {
contents: [{ parts: [{ text: solutionText }] }],
systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION_TTS_SUMMARY }] },
};
try {
const response = await fetchWithRetry(apiUrl, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload)
});
updateTrialRemainingFromResponse(response);
const responseText = await response.text();
if (!response.ok || !responseText) {
// Server-Fehler (z.B. Kontingent aufgebraucht, Rate-Limit) kommen als
// {"error": "..."} — nur die Klartext-Message anzeigen statt des rohen
// JSON-Strings.
const errorMsg = extractApiErrorMessage(responseText, responseText || `API-Fehler mit Status: ${response.status}`);
const err = new Error(errorMsg);
err.status = response.status;
throw err;
}
const result = JSON.parse(responseText);
const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) throw new Error("Leere Antwort von der KI.");
setTtsShortText(text);
speakText(text);
} catch (e) {
console.error("API-Fehler (TTS-Kurzfassung):", e);
if (e.status === 402) {
handleTrialExceededError(e.message);
} else {
queueErrorReport('gemini-tts-summary-api', e);
flushErrorReports(db, userId, appId);
setError("Kurzfassung konnte nicht erstellt werden. Bitte erneut versuchen oder auf 'Vollständig' umschalten.");
}
} finally {
setIsGeneratingTtsShort(false);
}
}, [solutionText, speakText, db, userId, handleTrialExceededError]);
const handleToggleTts = useCallback(() => {
if (isTtsPlaying) {
stopSpeaking();
return;
}
if (!solutionText || isGeneratingTtsShort || isTtsLoading) return;
if (ttsMode === 'short') {
if (ttsShortText) {
speakText(ttsShortText);
} else {
callGeminiTtsSummaryAPI();
}
} else {
speakText(solutionText);
}
}, [isTtsPlaying, solutionText, isGeneratingTtsShort, isTtsLoading, ttsMode, ttsShortText, speakText, callGeminiTtsSummaryAPI, stopSpeaking]);
// Liest den X-Trial-Remaining-Header aus einer /api/gemini-Antwort (siehe
// api/gemini.js) und hält den Live-Zähler im Banner aktuell. Fehlt der
// Header (z.B. Admin-Konto oder Tracking serverseitig aus), bleibt der
// bisherige Stand.
const updateTrialRemainingFromResponse = (response) => {
const header = response.headers.get('X-Trial-Remaining');
if (header === null) return;
const value = Number(header);
if (Number.isFinite(value)) setTrialRemaining(value);
};
// --- EFFECT: FIREBASE INITIALISIERUNG UND ANONYME ANMELDUNG ---
useEffect(() => {
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
console.error("Firebase Config unvollständig (VITE_FIREBASE_* Env-Variablen fehlen). Firestore-Funktionalität deaktiviert.");
setIsAuthReady(true);
return;
}
let authInstance;
let dbInstance;
try {
const app = initializeApp(firebaseConfig);
authInstance = getAuth(app);
dbInstance = getFirestore(app);
// App Check schützt /api/gemini gegen gescripteten Missbrauch (siehe
// api/gemini.js). Ohne Site-Key bleibt es clientseitig einfach aus.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaSiteKey) {
if (import.meta.env.DEV) {
// Standard-Pattern für lokale Entwicklung ohne reCAPTCHA-Domain-Freigabe:
// Debug-Token erscheint in der Konsole und muss einmalig in der Firebase
// Console unter App Check > Debug-Tokens hinterlegt werden.
self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
try {
appCheckInstance = initializeAppCheck(app, {
provider: new ReCaptchaV3Provider(recaptchaSiteKey),
isTokenAutoRefreshEnabled: true,
});
setErrorReportingAppCheck(appCheckInstance);
} catch (e) {
console.error("App-Check-Initialisierung fehlgeschlagen:", e);
queueErrorReport('app-check-init', e);
}
} else {
console.warn("VITE_RECAPTCHA_SITE_KEY fehlt — App Check ist deaktiviert.");
}
} catch (e) {
console.error("Fehler bei der Firebase-Initialisierung:", e);
queueErrorReport('firebase-init', e);
setIsAuthReady(true);
return;
}
setAuth(authInstance);
currentAuthInstance = authInstance;
setDb(dbInstance);
// Zählt diesen App-Start für den Admin-Bereich (api/app-start.js) — genau
// einmal pro Seiten-Ladevorgang, erst sobald der Auth-Status bekannt ist.
// Rein informativ, Fehler/fehlendes App Check bleiben bewusst stumm.
let appStartLogged = false;
const logAppStartOnce = () => {
  if (appStartLogged) return;
  appStartLogged = true;
  fetchWithRetry(appStartUrl, { method: 'POST' }, 1).catch(() => {});
};
const unsubscribe = onAuthStateChanged(authInstance, (user) => {
if (user && user.uid && !user.isAnonymous) {
setUserId(user.uid);
setAuthUser(toAuthUserSnapshot(user));
setShowAuth(false);
// Zeigt den Live-Stand des Pro-Konto-Kontingents (api/trial-status.js)
// schon vor der ersten Analyse an — braucht das ID-Token, daher erst hier
// (nach dem Login) statt schon beim Modul-Start. Rein informativ:
// Netzwerk-/Server-Fehler bleiben stumm, das Banner fällt dann auf die
// statische Obergrenze zurück.
fetchWithRetry(trialStatusUrl, { method: 'GET' }, 1)
.then((response) => (response.ok ? response.json() : null))
.then((data) => {
if (data && typeof data.remaining === 'number') setTrialRemaining(data.remaining);
})
.catch(() => {});
// Custom Claims stecken im ID-Token, nicht im User-Objekt selbst — erst
// getIdTokenResult() legt sie offen. Rein informativ für die UI (den
// eigentlichen Zugriffsschutz für Daten setzt firestore.rules durch),
// daher bleibt ein Fehler hier stumm und isAdmin einfach false.
getIdTokenResult(user)
.then((r) => {
setIsAdmin(r.claims?.admin === true);
logAppStartOnce();
})
.catch(() => {
setIsAdmin(false);
logAppStartOnce();
});
} else {
// Kein Nutzer angemeldet, oder es liegt nur eine anonyme Alt-Sitzung von
// vor der Einführung des verpflichtenden Google-Logins vor: Zugriff bleibt
// gesperrt (Login-Gate, siehe "if (!isAuthReady || showAuth)" weiter
// unten). Eine vorhandene anonyme Alt-Sitzung wird bewusst NICHT
// abgemeldet — bleibt sie als auth.currentUser bestehen, übernimmt
// handleGoogleSignIn ihre Historie beim Login per linkWithPopup, statt sie
// zu verlieren.
setUserId(null);
setAuthUser(null);
setIsAdmin(false);
setShowAuth(true);
logAppStartOnce();
}
setIsAuthReady(true);
});
return () => unsubscribe();
}, []);
// Menschenlesbare Meldung je bekanntem Firebase-Auth-Fehlercode. Ohne das
// bliebe ein fehlgeschlagener Google-Login für den Nutzer unsichtbar (nur
// console.error) — sah aus wie "kurzer schwarzer Screen, dann nichts".
const describeGoogleSignInError = (e) => {
switch (e.code) {
case 'auth/unauthorized-domain':
return 'Diese Domain ist in Firebase nicht für Google-Login freigeschaltet (Authentication → Settings → Authorized domains).';
case 'auth/popup-blocked':
return 'Der Browser hat das Login-Popup blockiert. Bitte Popups für diese Seite erlauben und erneut versuchen.';
case 'auth/network-request-failed':
return 'Netzwerkfehler bei der Google-Anmeldung. Bitte Internetverbindung prüfen und erneut versuchen.';
case 'auth/popup-closed-by-user':
case 'auth/cancelled-popup-request':
return 'Das Login-Fenster wurde vorzeitig geschlossen, bevor die Anmeldung abgeschlossen war. Bitte erneut versuchen.';
default:
return `Google-Anmeldung fehlgeschlagen (${e.code || e.message}).`;
}
};
// --- FUNKTION: GOOGLE-LOGIN (verpflichtend, siehe Login-Gate weiter unten) ---
// Existiert bereits eine anonyme Alt-Sitzung aus der Zeit vor dem
// verpflichtenden Google-Login (siehe onAuthStateChanged oben), wird sie per
// Firebase Account-Linking mit dem Google-Konto verknüpft statt ersetzt —
// deren Historie bleibt so unter derselben UID erhalten, statt beim
// erzwungenen Login verloren zu gehen.
const handleGoogleSignIn = async () => {
if (!auth) return;
setIsGoogleSigningIn(true);
setGoogleSignInError(null);
const provider = new GoogleAuthProvider();
try {
let result;
if (auth.currentUser?.isAnonymous) {
result = await linkWithPopup(auth.currentUser, provider);
} else {
result = await signInWithPopup(auth, provider);
}
// onAuthStateChanged feuert nach linkWithPopup nicht zuverlässig erneut
// (gleiche UID) — State direkt aus dem Ergebnis setzen, damit die App
// sofort freigeschaltet wird statt erst nach einem Reload.
setUserId(result.user.uid);
setAuthUser(toAuthUserSnapshot(result.user));
setShowAuth(false);
} catch (e) {
if (e.code === 'auth/credential-already-in-use') {
// Das Google-Konto ist bereits mit einem anderen (echten) Nutzer
// verknüpft: dort stattdessen anmelden. Die anonyme Alt-Sitzung samt
// ihrer lokalen Historie geht dabei verloren. Tritt ab dem ersten
// erfolgreichen Link bei JEDER künftigen Anmeldung erneut auf (ein
// Google-Konto lässt sich nie ein zweites Mal verknüpfen) — deshalb NICHT
// per erneutem signInWithPopup (zweites, störendes Google-Popup bei jedem
// Login), sondern mit dem aus dem fehlgeschlagenen Link-Versuch bereits
// vorliegenden Credential direkt anmelden.
try {
const credential = GoogleAuthProvider.credentialFromError(e);
const result = credential
? await signInWithCredential(auth, credential)
: await signInWithPopup(auth, provider); // Fallback, falls Firebase kein Credential mitliefert
setUserId(result.user.uid);
setAuthUser(toAuthUserSnapshot(result.user));
setShowAuth(false);
} catch (e2) {
console.error('Google-Anmeldung fehlgeschlagen:', e2);
setGoogleSignInError(describeGoogleSignInError(e2));
queueErrorReport('google-signin', e2);
}
} else {
console.error('Google-Anmeldung fehlgeschlagen:', e);
setGoogleSignInError(describeGoogleSignInError(e));
// Bei bloßem Nutzer-Abbruch (Popup selbst geschlossen) keinen Report
// erzeugen — alle anderen Fehler (z.B. nicht freigeschaltete Domain)
// landen im Admin-Bereich, damit sie nicht mehr lautlos untergehen.
if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
queueErrorReport('google-signin', e);
}
}
} finally {
setIsGoogleSigningIn(false);
}
};
// --- EFFECT: Wartende Fehlerreports senden, sobald eine authentifizierte
// Firestore-Verbindung besteht (initial + bei Wiederherstellung der Internetverbindung) ---
useEffect(() => {
if (!db || !userId) return;
// Identität des meldenden Nutzers wird am Report mitgespeichert, damit der
// Admin-Bereich Reports einer echten Person zuordnen kann (Google-Login ist
// verpflichtend, isAnonymous ist für jeden hier erreichten userId immer false).
const reporterInfo = {
displayName: authUser?.displayName || null,
email: authUser?.email || null,
isAnonymous: false,
};
flushErrorReports(db, userId, appId, reporterInfo);
const handleOnline = () => flushErrorReports(db, userId, appId, reporterInfo);
window.addEventListener('online', handleOnline);
return () => window.removeEventListener('online', handleOnline);
}, [db, userId, authUser]);
// --- FUNKTION: ALLES ZURÜCKSETZEN ---
const handleReset = useCallback(() => {
audioRef.current?.pause();
if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
setIsTtsPlaying(false);
setSelectedImageBase64(null);
setProblemDescription('');
setSolutionText(null);
setSources([]);
setIsAnalyzing(false);
setError(null);
setMaterialList(null);
setSafetyTips(null);
setVideoLinks(null);
setClientReport(null);
setIsGeneratingMaterials(false);
setIsGeneratingSafety(false);
setIsGeneratingVideos(false);
setIsGeneratingReport(false);
setTradeToolResults({});
setLoadingTradeToolIds({});
// Dateiauswahl zurücksetzen (für saubere erneute Auswahl)
['camera-input', 'gallery-input', 'cloud-input'].forEach((id) => {
const fileInput = document.getElementById(id);
if (fileInput) fileInput.value = '';
});
}, []);
// --- FUNKTION: NUR FEHLERZUSTAND ZURÜCKSETZEN (Bild bleibt erhalten) ---
const clearError = useCallback(() => {
setError(null);
setIsAnalyzing(false);
}, []);
// --- FUNKTION: VERLAUFSEINTRAG LADEN ---
const handleSelectAnalysis = useCallback((item) => {
handleReset();
// Laden der Hauptfelder aus dem Verlaufseintrag
setProblemDescription(item.problemDescription || '');
setSelectedTradeState(item.selectedTrade || 'Allround-Handwerker');
setSolutionText(item.solutionText || null);
// Das Bild kann aus Performancegründen nicht aus Firestore geladen werden
setSelectedImageBase64(null);
setShowHistory(false);
}, [handleReset]);
// --- FUNKTION: DATEIAUSWAHL ---
const handleFileChange = useCallback(async (event) => {
const file = event.target.files[0];
if (file) {
handleReset();
setError(null);
try {
if (file.size > 20 * 1024 * 1024) {
setError("Das Bild ist zu groß (max. 20MB).");
return;
}
const base64 = await fileToBase64(file);
setSelectedImageBase64(base64);
} catch (e) {
console.error("Fehler beim Laden des Bildes:", e);
queueErrorReport('image-load', e);
flushErrorReports(db, userId, appId);
setError("Fehler beim Laden des Bildes.");
}
}
}, [handleReset, db, userId, appId]);
// --- FUNKTION: ANALYSE IN FIREBASE SPEICHERN ---
const saveAnalysis = useCallback(async (analysisData) => {
if (!db || !userId) {
console.warn("Speichern übersprungen: Benutzer nicht authentifiziert oder Datenbank nicht bereit.");
return;
}
try {
// Korrekter Pfad für private Benutzerdaten
const analysesCol = collection(db, 'artifacts', appId, 'users', userId, 'analyses');
// Fügt ein neues Dokument hinzu, ohne das Base64-Bild (zu groß für Firestore)
await setDoc(doc(analysesCol), {
userId,
timestamp: serverTimestamp(),
selectedTrade: analysisData.selectedTrade,
problemDescription: analysisData.problemDescription,
solutionText: analysisData.solutionText,
});
} catch (e) {
console.error("Fehler beim Speichern der Analyse:", e);
}
}, [db, userId, appId]);
// --- EFFECT: GEWERK LADEN (mit Firestore) und SPEICHERN ---
const saveTradePreference = useCallback(async (trade) => {
setSelectedTradeState(trade);
if (!db || !userId) {
console.warn("Speichern übersprungen: Benutzer nicht authentifiziert oder Datenbank nicht bereit.");
return;
}
// Korrekter Pfad für private Benutzerdaten
const profileRef = doc(db, 'artifacts', appId, 'users', userId, 'profile', 'data');
try {
await setDoc(profileRef, { preferredTrade: trade }, { merge: true });
} catch (e) {
console.error("Fehler beim Speichern des Berufs:", e);
}
}, [db, userId, appId]);
// Speichert (oder entfernt, bei key=null) den vom Nutzer selbst hinterlegten
// Gemini-API-Key im Profil (siehe UserProfileModal) — greift ab dem
// aufgebrauchten FREE_TRIAL_MAX-Kontingent serverseitig statt des zentralen
// Keys (siehe api/gemini.js getUserOwnApiKey). Direkter Client-Write, gleiche
// firestore.rules-Beschränkung auf den eigenen Nutzer wie preferredTrade.
const saveOwnApiKey = useCallback(async (key) => {
if (!db || !userId) return;
const profileRef = doc(db, 'artifacts', appId, 'users', userId, 'profile', 'data');
try {
await setDoc(profileRef, { geminiApiKey: key || null }, { merge: true });
setOwnApiKey(key || '');
} catch (e) {
console.error("Fehler beim Speichern des eigenen API-Keys:", e);
}
}, [db, userId, appId]);
useEffect(() => {
if (!isAuthReady || !db || !userId) return;
const loadProfile = async () => {
// Korrekter Pfad für private Benutzerdaten
const profileRef = doc(db, 'artifacts', appId, 'users', userId, 'profile', 'data');
try {
const docSnap = await getDoc(profileRef);
if (docSnap.exists()) {
const data = docSnap.data();
if (data.preferredTrade) {
setSelectedTradeState(data.preferredTrade);
}
if (data.geminiApiKey) {
setOwnApiKey(data.geminiApiKey);
}
}
} catch (e) {
console.error("Fehler beim Laden des Profils:", e);
}
};
loadProfile();
}, [isAuthReady, db, userId, appId]);
// --- FUNKTION: BILDANALYSE (Haupt-API-Aufruf) ---
const callGeminiVisionAPI = useCallback(async () => {
// Prüfung, ob mindestens ein Eingabeelement vorhanden ist
const hasImage = !!selectedImageBase64;
const hasDescription = problemDescription.trim().length > 0;
if (!hasImage && !hasDescription) {
setError("🔴 AKTION ERFORDERLICH: Bitte wählen Sie ein Bild ODER geben Sie eine Problembeschreibung ein, um die Analyse zu starten.");
return;
}
setIsAnalyzing(true);
setError(null);
setSolutionText(null);
// Zurücksetzen aller Neben-Features
setMaterialList(null);
setSafetyTips(null);
setVideoLinks(null);
setClientReport(null);
setTradeToolResults({});
setLoadingTradeToolIds({});
setSources([]);
const mimeType = 'image/jpeg';
const tradeContext = selectedTrade && selectedTrade !== "Sonstiges..."
? `[GEWERK: ${selectedTrade}]. `
: selectedTrade === "Sonstiges..."
? `[GEWERK: Sonstiges]. `
: '';
const descContext = problemDescription.trim()
? `[BESCHREIBUNG: ${problemDescription.trim()}]. Die Analyse MUSS sich vorrangig auf diese Beschreibung und das Bild konzentrieren, um die Fehlerursache zu finden.`
: 'Analysiere das gezeigte Bauproblem und schlage eine Lösung vor.';
const userQuery = `${tradeContext}${descContext}`;
// Erstellung des Contents: Bild (falls vorhanden) und Text
const contents = [
{
role: "user",
parts: [
{ text: userQuery },
...(hasImage ? [{
inlineData: {
mimeType: mimeType,
data: selectedImageBase64
}
}] : [])
]
}
];
const payload = {
contents: contents,
systemInstruction: {
parts: [{ text: SYSTEM_INSTRUCTION }]
},
};
try {
const response = await fetchWithRetry(apiUrl, {
method: 'POST',
// "X-Analysis-Kind: main" markiert diesen Aufruf als Haupt-Diagnose
// gegenüber api/gemini.js — nur er verbraucht einen Slot des
// Pro-Konto-Kontingents (FREE_TRIAL_MAX), Zusatz-Tools nicht.
headers: { 'Content-Type': 'application/json', 'X-Analysis-Kind': 'main' },
body: JSON.stringify(payload)
});
updateTrialRemainingFromResponse(response);
// Robuste Verarbeitung der JSON-Antwort
const responseText = await response.text();
if (!response.ok || !responseText) {
// Server-Fehler (z.B. Kontingent aufgebraucht, Rate-Limit) kommen als
// {"error": "..."} — nur die Klartext-Message anzeigen statt des rohen
// JSON-Strings.
const errorMsg = extractApiErrorMessage(responseText, responseText || `API-Fehler mit Status: ${response.status}`);
console.error("API Response Fehler:", errorMsg);
const err = new Error(errorMsg);
err.status = response.status;
throw err;
}
let result;
try {
result = JSON.parse(responseText);
} catch (parseError) {
console.error("JSON-Parse-Fehler:", parseError, "Antworttext:", responseText);
throw new Error("Ungültige Antwortstruktur von der KI.");
}
const candidate = result.candidates?.[0];
if (candidate && candidate.content?.parts?.[0]?.text) {
const solution = candidate.content.parts[0].text;
setSolutionText(solution);
playCompletionSound();
// Speichern der Analyse in Firestore
await saveAnalysis({
selectedTrade,
problemDescription,
solutionText: solution,
});
} else {
queueErrorReport('gemini-vision-api', new Error('Antwort ohne verwertbaren Kandidaten'));
flushErrorReports(db, userId, appId);
setError("Konnte keine gültige Antwort von der KI erhalten. Mögliches Problem: Das Bild ist zu unklar oder der Dienst ist nicht erreichbar.");
}
} catch (e) {
console.error("API-Fehler:", e);
// Status 402: kostenloses Kontingent aufgebraucht, kein eigener API-Key
// hinterlegt (siehe api/gemini.js) — die reale, actionable Fehlermeldung
// zeigen statt des generischen "erneut versuchen"-Texts, der hier nichts
// bringt, solange kein eigener Key hinterlegt ist.
if (e.status === 402) {
handleTrialExceededError(e.message);
} else {
queueErrorReport('gemini-vision-api', e);
flushErrorReports(db, userId, appId);
setError("Die Analyse konnte nicht abgeschlossen werden. Bitte in ein paar Minuten erneut versuchen.");
}
} finally {
setIsAnalyzing(false);
}
}, [selectedImageBase64, problemDescription, selectedTrade, saveAnalysis, db, userId, handleTrialExceededError]);
// --- FUNKTION: Materialliste generieren (JSON Mode) ---
const callGeminiMaterialsAPI = useCallback(async () => {
if (!solutionText) return;
setIsGeneratingMaterials(true);
setMaterialList(null);
const userQuery = `Erstelle die Material- und Werkzeugliste für diese Lösung: ${solutionText}`;
const payload = {
contents: [{ parts: [{ text: userQuery }] }],
systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION_MATERIAL }] },
generationConfig: {
responseMimeType: "application/json",
responseSchema: MATERIAL_SCHEMA,
}
};
try {
const response = await fetchWithRetry(apiUrl, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload)
});
updateTrialRemainingFromResponse(response);
const responseText = await response.text();
if (!response.ok || !responseText) {
// Server-Fehler (z.B. Kontingent aufgebraucht, Rate-Limit) kommen als
// {"error": "..."} — nur die Klartext-Message anzeigen statt des rohen
// JSON-Strings.
const errorMsg = extractApiErrorMessage(responseText, responseText || `API-Fehler mit Status: ${response.status}`);
console.error("API Response Fehler:", errorMsg);
const err = new Error(errorMsg);
err.status = response.status;
throw err;
}
let result;
try {
result = JSON.parse(responseText);
} catch (parseError) {
console.error("JSON-Parse-Fehler:", parseError, "Antworttext:", responseText);
throw new Error("Ungültige Antwortstruktur von der KI.");
}
const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
if (jsonString && jsonString.trim().length > 0) {
try {
// Robuster Parse-Versuch
const parsedJson = JSON.parse(jsonString);
setMaterialList(parsedJson);
} catch (parseError) {
console.error("JSON Parsing Fehler (Material):", parseError);
queueErrorReport('gemini-materials-api', parseError);
flushErrorReports(db, userId, appId);
setError("Fehler beim Verarbeiten der KI-Antwort (ungültiges JSON-Format oder unvollständige Antwort).");
}
} else {
queueErrorReport('gemini-materials-api', new Error('Antwort ohne strukturierte Materialliste'));
flushErrorReports(db, userId, appId);
setError("Konnte keine Materialliste erstellen. Die KI hat keine strukturierte Antwort geliefert.");
}
} catch (e) {
console.error("API-Fehler (Material):", e);
if (e.status === 402) {
handleTrialExceededError(e.message);
} else {
queueErrorReport('gemini-materials-api', e);
flushErrorReports(db, userId, appId);
setError("Die Materialliste konnte nicht erstellt werden. Bitte in ein paar Minuten erneut versuchen.");
}
} finally {
setIsGeneratingMaterials(false);
}
}, [solutionText, db, userId, handleTrialExceededError]);
// --- FUNKTION: Sicherheits-Check generieren (Text Mode) ---
const callGeminiSafetyAPI = useCallback(async () => {
if (!solutionText) return;
setIsGeneratingSafety(true);
setSafetyTips(null);
const userQuery = `Führe eine Sicherheitsbewertung für diese Lösung durch: ${solutionText}`;
const payload = {
contents: [{ parts: [{ text: userQuery }] }],
systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION_SAFETY }] },
};
try {
const response = await fetchWithRetry(apiUrl, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload)
});
updateTrialRemainingFromResponse(response);
const responseText = await response.text();
if (!response.ok || !responseText) {
// Server-Fehler (z.B. Kontingent aufgebraucht, Rate-Limit) kommen als
// {"error": "..."} — nur die Klartext-Message anzeigen statt des rohen
// JSON-Strings.
const errorMsg = extractApiErrorMessage(responseText, responseText || `API-Fehler mit Status: ${response.status}`);
console.error("API Response Fehler:", errorMsg);
const err = new Error(errorMsg);
err.status = response.status;
throw err;
}
let result;
try {
result = JSON.parse(responseText);
} catch (parseError) {
console.error("JSON-Parse-Fehler:", parseError, "Antworttext:", responseText);
throw new Error("Ungültige Antwortstruktur von der KI.");
}
const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
if (text) {
setSafetyTips(text);
} else {
queueErrorReport('gemini-safety-api', new Error('Antwort ohne verwertbaren Kandidaten'));
flushErrorReports(db, userId, appId);
setError("Konnte den Sicherheits-Check nicht erstellen.");
}
} catch (e) {
console.error("API-Fehler (Sicherheit):", e);
if (e.status === 402) {
handleTrialExceededError(e.message);
} else {
queueErrorReport('gemini-safety-api', e);
flushErrorReports(db, userId, appId);
setError("Der Sicherheits-Check konnte nicht erstellt werden. Bitte in ein paar Minuten erneut versuchen.");
}
} finally {
setIsGeneratingSafety(false);
}
}, [solutionText, db, userId, handleTrialExceededError]);
// --- FUNKTION: Kundenbericht generieren (Text Mode) ---
const callGeminiClientReportAPI = useCallback(async () => {
if (!solutionText) return;
setIsGeneratingReport(true);
setClientReport(null);
const userQuery = `Erstelle einen Kundenbericht und die administrativen nächsten Schritte für diese technische Lösung: ${solutionText}`;
const payload = {
contents: [{ parts: [{ text: userQuery }] }],
systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION_CLIENT_REPORT }] },
};
try {
const response = await fetchWithRetry(apiUrl, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload)
});
updateTrialRemainingFromResponse(response);
const responseText = await response.text();
if (!response.ok || !responseText) {
// Server-Fehler (z.B. Kontingent aufgebraucht, Rate-Limit) kommen als
// {"error": "..."} — nur die Klartext-Message anzeigen statt des rohen
// JSON-Strings.
const errorMsg = extractApiErrorMessage(responseText, responseText || `API-Fehler mit Status: ${response.status}`);
console.error("API Response Fehler:", errorMsg);
const err = new Error(errorMsg);
err.status = response.status;
throw err;
}
let result;
try {
result = JSON.parse(responseText);
} catch (parseError) {
console.error("JSON-Parse-Fehler:", parseError, "Antworttext:", responseText);
throw new Error("Ungültige Antwortstruktur von der KI.");
}
const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
if (text) {
setClientReport(text);
} else {
queueErrorReport('gemini-client-report-api', new Error('Antwort ohne verwertbaren Kandidaten'));
flushErrorReports(db, userId, appId);
setError("Konnte den Kundenbericht nicht erstellen.");
}
} catch (e) {
console.error("API-Fehler (Kundenbericht):", e);
if (e.status === 402) {
handleTrialExceededError(e.message);
} else {
queueErrorReport('gemini-client-report-api', e);
flushErrorReports(db, userId, appId);
setError("Der Kundenbericht konnte nicht erstellt werden. Bitte in ein paar Minuten erneut versuchen.");
}
} finally {
setIsGeneratingReport(false);
}
}, [solutionText, db, userId, handleTrialExceededError]);
// --- FUNKTION: Berufs-spezifisches KI-Tool aufrufen (TRADE_TOOLS, Text Mode) ---
// Generisch statt eine eigene Funktion pro Tool, da systemInstruction/Query
// je Tool (TRADE_TOOLS) variieren, Fetch/Fehlerbehandlung aber identisch sind.
const callGeminiTradeToolAPI = useCallback(async (tool) => {
setLoadingTradeToolIds((prev) => ({ ...prev, [tool.id]: true }));
setTradeToolResults((prev) => ({ ...prev, [tool.id]: null }));
const payload = {
contents: [{ parts: [{ text: tool.buildQuery({ solutionText, problemDescription, selectedTrade }) }] }],
systemInstruction: { parts: [{ text: tool.systemInstruction }] },
};
try {
const response = await fetchWithRetry(apiUrl, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload)
});
updateTrialRemainingFromResponse(response);
const responseText = await response.text();
if (!response.ok || !responseText) {
// Server-Fehler (z.B. Kontingent aufgebraucht, Rate-Limit) kommen als
// {"error": "..."} — nur die Klartext-Message anzeigen statt des rohen
// JSON-Strings.
const errorMsg = extractApiErrorMessage(responseText, responseText || `API-Fehler mit Status: ${response.status}`);
console.error("API Response Fehler:", errorMsg);
const err = new Error(errorMsg);
err.status = response.status;
throw err;
}
let result;
try {
result = JSON.parse(responseText);
} catch (parseError) {
console.error("JSON-Parse-Fehler:", parseError, "Antworttext:", responseText);
throw new Error("Ungültige Antwortstruktur von der KI.");
}
const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
if (text) {
setTradeToolResults((prev) => ({ ...prev, [tool.id]: text }));
} else {
queueErrorReport('gemini-trade-tool-api', new Error(`Antwort ohne verwertbaren Kandidaten (${tool.id})`));
flushErrorReports(db, userId, appId);
setError(`Konnte "${tool.label}" nicht erstellen.`);
}
} catch (e) {
console.error(`API-Fehler (${tool.label}):`, e);
if (e.status === 402) {
handleTrialExceededError(e.message);
} else {
queueErrorReport('gemini-trade-tool-api', e);
flushErrorReports(db, userId, appId);
setError(`"${tool.label}" konnte nicht erstellt werden. Bitte in ein paar Minuten erneut versuchen.`);
}
} finally {
setLoadingTradeToolIds((prev) => ({ ...prev, [tool.id]: false }));
}
}, [solutionText, problemDescription, selectedTrade, db, userId, handleTrialExceededError]);
// --- FUNKTION: Video-Anleitungen suchen (Google-Search-Grounding) ---
// Hinweis: responseSchema/responseMimeType lassen sich bei der Gemini API nicht mit
// dem "tools"-Grounding kombinieren, daher wird das JSON-Array per Prompt erzwungen
// und robust per Regex aus der Textantwort extrahiert.
const callGeminiVideoSearch = useCallback(async () => {
  if (!solutionText) return;
  setIsGeneratingVideos(true);
  setVideoLinks(null);
  const userQuery = `Finde die besten 3 bis 5 YouTube-Video-Anleitungen für diese Lösung im Beruf ${selectedTrade}: ${solutionText}`;
  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION_VIDEO_FINAL }] },
    tools: [{ google_search: {} }],
  };
  try {
    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    updateTrialRemainingFromResponse(response);
    const responseText = await response.text();
    if (!response.ok || !responseText) {
      // Server-Fehler (z.B. Kontingent aufgebraucht, Rate-Limit) kommen als
      // {"error": "..."} — nur die Klartext-Message anzeigen statt des rohen
      // JSON-Strings.
      const errorMsg = extractApiErrorMessage(responseText, responseText || `API-Fehler mit Status: ${response.status}`);
      console.error("API Response Fehler:", errorMsg);
      const err = new Error(errorMsg);
      err.status = response.status;
      throw err;
    }
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSON-Parse-Fehler:", parseError, "Antworttext:", responseText);
      throw new Error("Ungültige Antwortstruktur von der KI.");
    }
    const responseTextContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (responseTextContent && responseTextContent.trim().length > 0) {
      const jsonMatch = responseTextContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (!jsonMatch || !jsonMatch[0]) {
        console.error("JSON Regex Match Fehler:", responseTextContent);
        queueErrorReport('gemini-video-search-api', new Error('Antwort ohne extrahierbares JSON-Array'));
        flushErrorReports(db, userId, appId);
        setError("Die KI-Antwort enthielt kein gültiges JSON-Array. Bitte erneut versuchen.");
        return;
      }
      try {
        const parsedJson = JSON.parse(jsonMatch[0]);
        const validLinks = parsedJson.filter(link =>
          link.uri && link.uri.includes('youtube.com/watch') && link.title
        );
        if (validLinks.length > 0) {
          setVideoLinks(validLinks);
        } else {
          queueErrorReport('gemini-video-search-api', new Error('Keine gültigen YouTube-Links im Ergebnis'));
          flushErrorReports(db, userId, appId);
          setError("Die KI hat keine passenden YouTube-Video-Links gefunden.");
        }
      } catch (parseError) {
        console.error("JSON Parsing Fehler (Video Search):", parseError);
        queueErrorReport('gemini-video-search-api', parseError);
        flushErrorReports(db, userId, appId);
        setError("Fehler beim Verarbeiten der KI-Antwort (ungültiges JSON-Format).");
      }
    } else {
      queueErrorReport('gemini-video-search-api', new Error('Antwort ohne verwertbaren Kandidaten'));
      flushErrorReports(db, userId, appId);
      setError("Konnte die Video-Links nicht generieren. Die KI hat keine verwertbare Antwort geliefert.");
    }
  } catch (e) {
    console.error("API-Fehler (Video Search):", e);
    if (e.status === 402) {
      handleTrialExceededError(e.message);
    } else {
      queueErrorReport('gemini-video-search-api', e);
      flushErrorReports(db, userId, appId);
      setError("Die Video-Anleitungen konnten nicht gefunden werden. Bitte in ein paar Minuten erneut versuchen.");
    }
  } finally {
    setIsGeneratingVideos(false);
  }
}, [solutionText, selectedTrade, db, userId, handleTrialExceededError]);
// --- FUNKTION: PDF-EXPORT ---
const handleExportPdf = useCallback(() => {
// Export ist auch ohne abgeschlossene Diagnose möglich, sobald mindestens
// ein Berufs-Spezial-Tool-Ergebnis vorliegt (die Tools sind seit V2.0.0
// schon ohne Diagnose nutzbar, siehe buildTradeToolQuery). tradeToolResultEntries
// (siehe oben) enthält Ergebnisse ALLER Berufe, nicht nur des aktuell
// gewählten, damit auch gestapelte Ergebnisse aus mehreren Berufen exportiert werden.
const tradeToolEntries = tradeToolResultEntries;
if (!solutionText && tradeToolEntries.length === 0) {
setError("Es gibt keine Analyseergebnisse zum Exportieren.");
return;
}
const date = new Date().toLocaleDateString('de-DE');
const problemHtml = problemDescription.trim()
? `<p class="mt-2 text-sm text-gray-600"><strong>Problembeschreibung:</strong> ${problemDescription.trim()}</p>`
: '';
const tradeHtml = selectedTrade
? `<p class="meta"><strong>Beruf:</strong> ${selectedTrade}</p>`
: '';
// Konvertiere Markdown-Formatierung in einfache HTML-Tags
const solutionHtml = solutionText
? solutionText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')
: '';
let materialHtml = '';
if (materialList && materialList.length > 0) {
materialHtml = `
<h2>3. Benötigte Materialien und Werkzeuge</h2>
<table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
<thead>
<tr style="background-color: #eee;">
<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Kategorie</th>
<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Artikel</th>
<th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Menge</th>
</tr>
</thead>
<tbody>
${materialList.map(item => `
<tr>
<td style="border: 1px solid #ccc; padding: 8px;">${item.category}</td>
<td style="border: 1px solid #ccc; padding: 8px;">${item.item}</td>
<td style="border: 1px solid #ccc; padding: 8px;">${item.quantity}</td>
</tr>
`).join('')}
</tbody>
</table>
`;
}
let safetyHtml = '';
if (safetyTips) {
const safetyContent = safetyTips
.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
.replace(/\n/g, '<br/>');
safetyHtml = `
<h2>4. Sicherheits-Check (PSA & Risiko)</h2>
<div class="result-box">
${safetyContent}
</div>
`;
}
let videoHtml = '';
if (videoLinks && videoLinks.length > 0) {
videoHtml = `
<h2>5. Video-Anleitungen (YouTube)</h2>
<ul style="list-style-type: none; padding-left: 0;">
${videoLinks.map(link => `
<li style="margin-bottom: 10px; border-left: 3px solid #007bff; padding-left: 10px;">
<strong style="display: block;">${link.title}</strong>
<a href="${link.uri}" style="color: #007bff; font-size: 0.9em; text-decoration: none;">Link zum Video</a>
</li>
`).join('')}
</ul>
`;
}
let reportHtml = '';
if (clientReport) {
const reportContent = clientReport
.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
.replace(/\n/g, '<br/>');
reportHtml = `
<h2>6. Kundenbericht & Administrative Schritte</h2>
<div class="result-box">
${reportContent}
</div>
`;
}
let tradeToolsHtml = '';
if (tradeToolEntries.length > 0) {
tradeToolsHtml = `
<h2>7. Berufs-Spezial-Tools</h2>
${tradeToolEntries.map(({ tool, text, trade }) => `
<div class="result-box" style="margin-bottom: 15px;">
<strong>${tool.label}</strong>${trade ? ` <span style="color:#999;font-weight:normal;">(${trade})</span>` : ''}
<div>${text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')}</div>
</div>
`).join('')}
`;
}
const printContent = `
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sm@rtCraft Bericht - ${date}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif; margin: 40px; color: #333; line-height: 1.6; }
h1 { color: #cc0000; border-bottom: 4px solid #ff8800; padding-bottom: 10px; margin-bottom: 30px; }
h2 { color: #007bff; font-size: 1.2em; border-left: 5px solid #007bff; padding-left: 10px; margin-top: 25px; }
.section { margin-bottom: 25px; }
.result-box { background-color: #f9f9f9; padding: 15px; border-radius: 6px; border: 1px solid #eee; }
.image-preview { max-width: 80%; height: auto; margin: 15px 0; border: 1px solid #ccc; border-radius: 4px; display: block; }
.meta { font-size: 0.9em; color: #666; margin-top: 10px; }
table { border-collapse: collapse; margin-top: 10px; }
th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
th { background-color: #eee; }
@media print {
.image-preview { max-width: 100%; page-break-before: auto; page-break-after: auto; }
.section { page-break-inside: avoid; }
}
</style>
</head>
<body>
<h1>Sm@rtCraft – Der Kollege in der Hosentasche</h1>
<p class="meta"><strong>Berichtsdatum:</strong> ${date}</p>
${tradeHtml}
<div class="section">
<h2>1. Dokumentation & Problemstellung</h2>
${problemHtml}
${selectedImageBase64 ?
`<img class="image-preview" src="data:image/jpeg;base64,${selectedImageBase64}" alt="Problemstelle">` :
'<p class="meta italic">Kein Bild beigefügt.</p>'}
</div>
${solutionText ? `
<div class="section">
<h2>2. KI-Diagnose und Lösungsvorschlag</h2>
<div class="result-box">
${solutionHtml}
</div>
</div>
` : ''}
${materialHtml}
${safetyHtml}
${videoHtml}
${reportHtml}
${tradeToolsHtml}
<p class="meta">Bericht generiert von der Sm@rtCraft Handwerker App.</p>
</body>
</html>
`;
const printWindow = window.open('', '_blank');
if (printWindow) {
printWindow.document.write(printContent);
printWindow.document.close();
// Timeout, um dem Browser Zeit zum Rendern zu geben, bevor gedruckt wird
setTimeout(() => {
printWindow.print();
}, 500);
} else {
setError("Der Browser hat das Popup-Fenster blockiert. Bitte erlauben Sie Popups.");
}
}, [solutionText, problemDescription, selectedImageBase64, selectedTrade, materialList, safetyTips, videoLinks, clientReport, tradeToolResultEntries]);
// Dünne Abstraktion für die Anzeige des Ergebniszustands (Laden, Fehler, Lösung)
const ResultDisplay = useMemo(() => {
// NEUE PRÜFUNG: Mindestens ein Element muss vorhanden sein
const isReadyForAnalysis = !!selectedImageBase64 || problemDescription.trim().length > 0;
if (isAnalyzing) {
return (
<div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl shadow-inner">
{/* AKZENTFARBE: Blau für Lade-Spinne */}
<Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
<p className="mt-4 text-gray-700 font-semibold">Analyse läuft...</p>
<p className="text-sm text-gray-500">Der Bau-Experte prüft die Situation.</p>
</div>
);
}
if (error) {
return (
<div className="relative p-4 pr-10 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg shadow-md flex items-start space-x-3">
<button
type="button"
onClick={clearError}
aria-label="Fehler zurücksetzen"
title="Fehler zurücksetzen (Bild bleibt erhalten)"
className="absolute top-2 right-2 p-1 rounded-full text-red-500 hover:bg-red-200 hover:text-red-800 transition-colors"
>
<X className="w-4 h-4" />
</button>
<AlertTriangle className="w-5 h-5 mt-1 flex-shrink-0 text-red-600" />
<div>
<p className="font-bold">Analysefehler</p>
<p className="text-sm">{error}</p>
<p className="text-xs text-red-500 mt-1">Ihr Bild bleibt erhalten. Tippen Sie oben rechts, um es erneut zu versuchen.</p>
</div>
</div>
);
}
if (solutionText) {
return (
<div className="bg-white p-6 rounded-xl shadow-2xl border-t-4 border-blue-600 space-y-6">
<h2 className="text-2xl font-bold text-gray-800 flex items-center">
<CheckCircle className="w-6 h-6 text-green-500 mr-2" />
Lösung und Diagnose
</h2>
{/* Erneuter Hinweis aufs Pro-Konto-Kontingent direkt nach jeder Analyse
    (nicht nur im wegklickbaren Banner oben), damit der aktuelle Stand nicht
    übersehen wird — trialRemaining kommt aus dem X-Trial-Remaining-Header
    (siehe updateTrialRemainingFromResponse). Fehlt der Live-Wert (z.B. weil
    FIREBASE_SERVICE_ACCOUNT_KEY serverseitig nicht gesetzt ist und das
    Tracking damit inaktiv bleibt), zeigt die Zeile ersatzweise nur die
    statische Obergrenze, statt ganz zu verschwinden. */}
<p className="text-xs text-gray-500">
{ownApiKey
? "Eigener Gemini-API-Key aktiv: weitere Analysen laufen über Ihr eigenes Google-Konto."
: trialRemaining !== null
? (trialRemaining > 0
? `Noch ${trialRemaining} von ${FREE_TRIAL_MAX} kostenlosen Analysen übrig.`
: `Kostenloses Kontingent aufgebraucht. Bitte hinterlegen Sie im Profil einen eigenen Gemini-API-Key, um weiter zu analysieren.`)
: `Kostenloses Kontingent von ${FREE_TRIAL_MAX} Analysen pro Konto.`}
</p>
{/* 1. Hauptlösung */}
<div className="prose max-w-none text-gray-700 leading-relaxed max-h-96 overflow-y-auto p-3 border border-gray-200 rounded-lg bg-gray-50">
{/* Anzeige des Lösungstextes */}
<div dangerouslySetInnerHTML={{ __html: solutionText.replace(/\n/g, '<br/>') }} />
</div>
{/* Sprachausgabe (TTS) — läuft über api/tts.js (Google Cloud Text-to-Speech) */}
<div className="p-3 bg-gray-50 border-l-4 rounded-lg shadow-md space-y-2" style={{ borderColor: theme.accent }}>
<audio ref={audioRef} className="hidden" />
<div className="flex items-center justify-between gap-2 flex-wrap">
<button
type="button"
onClick={handleToggleTts}
disabled={isGeneratingTtsShort || isTtsLoading}
className="flex items-center px-3 py-2 rounded-lg font-bold text-white shadow-md transition duration-300 text-sm active:scale-[0.98] disabled:opacity-60"
style={{ backgroundColor: theme.accent }}
>
{(isGeneratingTtsShort || isTtsLoading) ? (
<Loader2 className="w-4 h-4 mr-2 animate-spin" />
) : isTtsPlaying ? (
<VolumeX className="w-4 h-4 mr-2" />
) : (
<Volume2 className="w-4 h-4 mr-2" />
)}
{isGeneratingTtsShort ? 'Kurzfassung wird erstellt…' : isTtsLoading ? 'Sprachausgabe wird geladen…' : isTtsPlaying ? 'Vorlesen stoppen' : 'Diagnose vorlesen'}
</button>
<div className="flex rounded-lg overflow-hidden border border-gray-300 text-xs font-semibold">
<button
type="button"
onClick={() => setTtsMode('short')}
aria-pressed={ttsMode === 'short'}
title="Nur die wichtigsten Punkte vorlesen"
className={`px-3 py-2 transition-colors ${ttsMode === 'short' ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
style={ttsMode === 'short' ? { backgroundColor: theme.accent } : undefined}
>
Kurz
</button>
<button
type="button"
onClick={() => setTtsMode('full')}
aria-pressed={ttsMode === 'full'}
title="Kompletten Diagnosetext vorlesen"
className={`px-3 py-2 border-l border-gray-300 transition-colors ${ttsMode === 'full' ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
style={ttsMode === 'full' ? { backgroundColor: theme.accent } : undefined}
>
Vollständig
</button>
</div>
<div className="flex rounded-lg overflow-hidden border border-gray-300 text-xs font-semibold">
<button
type="button"
onClick={() => setTtsGender('female')}
aria-pressed={ttsGender === 'female'}
className={`px-3 py-2 transition-colors ${ttsGender === 'female' ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
style={ttsGender === 'female' ? { backgroundColor: theme.accent } : undefined}
>
Weiblich
</button>
<button
type="button"
onClick={() => setTtsGender('male')}
aria-pressed={ttsGender === 'male'}
className={`px-3 py-2 border-l border-gray-300 transition-colors ${ttsGender === 'male' ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
style={ttsGender === 'male' ? { backgroundColor: theme.accent } : undefined}
>
Männlich
</button>
</div>
</div>
<p className="text-xs text-gray-500">
Stimme: Premium (Google Cloud TTS, WaveNet)
{' '}({ttsGender === 'male' ? 'männlich' : 'weiblich'})
{' '}— bei ausgeschöpftem Kontingent automatischer Wechsel zur Browser-Stimme
</p>
</div>
{/* 2. Generische KI-Tools (Berufs-Spezial-Tools sitzen jetzt direkt unter der Berufsauswahl, siehe TradeToolsSection) */}
<div className="border-t pt-4 border-gray-100">
<h3 className="text-lg font-semibold text-gray-700 mb-3">Zusätzliche KI-Tools:</h3>
<div className="grid grid-cols-2 gap-3">
{/* Materialliste Button (1/4) - Farbe: Indigo */}
<button
onClick={callGeminiMaterialsAPI}
disabled={isGeneratingMaterials || !solutionText}
className={`flex flex-col items-center justify-center p-2 rounded-xl font-bold text-white shadow-md transition duration-300 text-xs transform active:scale-[0.98] ${
isGeneratingMaterials ? 'bg-indigo-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'
}`}
>
{isGeneratingMaterials ? (
<Loader2 className="w-4 h-4 animate-spin" />
) : (
<Package className="w-4 h-4" />
)}
<span className="mt-1">✨ Materialliste</span>
</button>
{/* Sicherheits-Check Button (2/4) - Farbe: Teal */}
<button
onClick={callGeminiSafetyAPI}
disabled={isGeneratingSafety || !solutionText}
className={`flex flex-col items-center justify-center p-2 rounded-xl font-bold text-white shadow-md transition duration-300 text-xs transform active:scale-[0.98] ${
isGeneratingSafety ? 'bg-teal-400 cursor-wait' : 'bg-teal-600 hover:bg-teal-700'
}`}
>
{isGeneratingSafety ? (
<Loader2 className="w-4 h-4 animate-spin" />
) : (
<Shield className="w-4 h-4" />
)}
<span className="mt-1">✨ Sicherheits-Check</span>
</button>
{/* Video-Anleitung Button (3/4) - Farbe: Amber */}
<button
onClick={callGeminiVideoSearch}
disabled={isGeneratingVideos || !solutionText}
className={`flex flex-col items-center justify-center p-2 rounded-xl font-bold text-white shadow-md transition duration-300 text-xs transform active:scale-[0.98] ${
isGeneratingVideos ? 'bg-amber-400 cursor-wait' : 'bg-amber-600 hover:bg-amber-700'
}`}
>
{isGeneratingVideos ? (
<Loader2 className="w-4 h-4 animate-spin" />
) : (
<Video className="w-4 h-4" />
)}
<span className="mt-1">✨ Video-Anleitung</span>
</button>
{/* AKZENT-FEATURE: Kundenbericht Button (BLEIBT BLAU) */}
<button
onClick={callGeminiClientReportAPI}
disabled={isGeneratingReport || !solutionText}
className={`flex flex-col items-center justify-center p-2 rounded-xl font-bold text-white shadow-md transition duration-300 text-xs transform active:scale-[0.98] ${
isGeneratingReport ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700'
}`}
>
{isGeneratingReport ? (
<Loader2 className="w-4 h-4 animate-spin" />
) : (
<FileText className="w-4 h-4" />
)}
<span className="mt-1">✨ Kundenbericht</span>
</button>
</div>
</div>
{/* 3. Materialliste Ergebnis */}
{materialList && (
<div className="p-4 bg-white border border-gray-200 rounded-xl shadow-inner">
<div className="flex items-start justify-between mb-3">
<h4 className="text-md font-bold text-gray-800 flex items-center">
<Package className="w-5 h-5 mr-2 text-indigo-600" />
Benötigte Materialien und Werkzeuge
</h4>
<button
onClick={() => setMaterialList(null)}
className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition"
title="Ergebnis entfernen"
>
<X className="w-4 h-4" />
</button>
</div>
<div className="overflow-x-auto">
<table className="min-w-full divide-y divide-gray-200">
<thead className="bg-gray-50">
<tr>
<th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-lg">Kategorie</th>
<th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Artikel</th>
<th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-lg">Menge</th>
</tr>
</thead>
<tbody className="bg-white divide-y divide-gray-200">
{materialList.map((item, index) => (
<tr key={index} className={item.category === 'Werkzeug' ? 'bg-yellow-50/50' : ''}>
<td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{item.category}</td>
<td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{item.item}</td>
<td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700">{item.quantity}</td>
</tr>
))}
</tbody>
</table>
</div>
</div>
)}
{/* 4. Sicherheits-Check Ergebnis */}
{safetyTips && (
<div className="p-4 bg-white border border-gray-200 rounded-xl shadow-inner">
<div className="flex items-start justify-between mb-3">
<h4 className="text-md font-bold text-gray-800 flex items-center">
<Shield className="w-5 h-5 mr-2 text-teal-600" />
Sicherheits-Check (PSA & Risiko)
</h4>
<button
onClick={() => setSafetyTips(null)}
className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition"
title="Ergebnis entfernen"
>
<X className="w-4 h-4" />
</button>
</div>
<div className="text-sm text-gray-700 leading-relaxed">
<div dangerouslySetInnerHTML={{ __html: safetyTips.replace(/\n/g, '<br/>') }} />
</div>
</div>
)}
{/* 5. Video-Anleitungen Ergebnis */}
{videoLinks && (
<div className="p-4 bg-white border border-gray-200 rounded-xl shadow-inner">
<div className="flex items-start justify-between mb-3">
<h4 className="text-md font-bold text-gray-800 flex items-center">
<Video className="w-5 h-5 mr-2 text-amber-600" />
Video-Anleitungen (YouTube)
</h4>
<button
onClick={() => setVideoLinks(null)}
className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition"
title="Ergebnis entfernen"
>
<X className="w-4 h-4" />
</button>
</div>
<ul className="space-y-2">
{videoLinks.map((link, index) => (
// BLAUER AKZENT: Hervorhebung für Video-Links
<li key={index} className="border-l-4 border-blue-500 pl-3">
<a
href={link.uri}
target="_blank"
rel="noopener noreferrer"
className="text-sm text-blue-600 hover:text-blue-800 font-medium truncate block"
>
{link.title}
</a>
<span className="text-xs text-gray-500 block">Link zu YouTube</span>
</li>
))}
</ul>
</div>
)}
{/* 6. Kundenbericht Ergebnis */}
{clientReport && (
<div className="p-4 bg-white border border-gray-200 rounded-xl shadow-inner">
<div className="flex items-start justify-between mb-3">
<h4 className="text-md font-bold text-gray-800 flex items-center">
{/* BLAUER AKZENT: Icon Farbe */}
<FileText className="w-5 h-5 mr-2 text-blue-600" />
Kundenbericht & Nächste Schritte
</h4>
<button
onClick={() => setClientReport(null)}
className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition"
title="Ergebnis entfernen"
>
<X className="w-4 h-4" />
</button>
</div>
<div className="text-sm text-gray-700 leading-relaxed">
<div dangerouslySetInnerHTML={{ __html: clientReport.replace(/\n/g, '<br/>') }} />
</div>
</div>
)}
{/* Berufs-Spezial-Tool-Ergebnisse: siehe TradeToolsSection direkt unter der Berufsauswahl */}
{/* 7. PDF EXPORT BUTTON */}
<div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
<button
onClick={handleExportPdf}
disabled={!solutionText || isGeneratingMaterials || isGeneratingSafety || isGeneratingVideos || isGeneratingReport}
// Primärfarbe folgt dem gewählten Beruf
className="flex items-center px-4 py-2 bg-(--accent) text-white font-semibold rounded-xl shadow-md hover:bg-(--accent-dark) transition-colors duration-500 ease-in-out transform active:scale-[0.98]"
>
<FileText className="w-4 h-4 mr-2" />
Als PDF exportieren
</button>
</div>
</div>
);
}
// Standard-Willkommensmeldung
return (
// Akzent (Rahmen & Icon) folgt dem gewählten Beruf
<div className="p-8 text-center text-gray-500 panel-parchment rounded-xl border-dashed border-4 border-(--accent-soft) transition-colors duration-700 ease-in-out">
<Smartphone className="w-8 h-8 mx-auto text-(--accent) mb-3 transition-colors duration-700 ease-in-out" />
<p className="font-semibold text-lg text-gray-800">Starten Sie Ihre Bauanalyse</p>
<p className="text-sm mt-2 text-gray-600 font-bold">
Um die Analyse zu starten, benötigen Sie **eines** der folgenden Elemente:
</p>
<ul className="text-sm mt-3 space-y-1 text-gray-700 text-left mx-auto max-w-xs">
<li>
<span className='font-bold text-(--accent) mr-1 transition-colors duration-500 ease-in-out'>1.</span> Ein Foto der Problemstelle **(Abschnitt 2)**
</li>
<li>
<span className='font-bold text-(--accent) mr-1 transition-colors duration-500 ease-in-out'>2.</span> Eine detaillierte Problembeschreibung **(Abschnitt 2)**
</li>
</ul>
<p className="text-xs mt-4 text-gray-500">Wählen Sie zuerst Ihren Beruf (Abschnitt 1) für eine präzisere Diagnose.</p>
</div>
);
}, [isAnalyzing, error, clearError, solutionText, handleExportPdf, materialList, safetyTips, videoLinks, clientReport, isGeneratingMaterials, isGeneratingSafety, isGeneratingVideos, isGeneratingReport, callGeminiMaterialsAPI, callGeminiSafetyAPI, callGeminiVideoSearch, callGeminiClientReportAPI, selectedImageBase64, problemDescription, isTtsPlaying, isTtsLoading, ttsGender, ttsMode, isGeneratingTtsShort, handleToggleTts, theme, trialRemaining, ownApiKey]);
// Schritt-für-Schritt-Anleitung zum Hinterlegen eines eigenen Gemini-API-Keys —
// öffnet sich automatisch über handleTrialExceededError, sobald eine KI-Anfrage
// mit Status 402 scheitert (Kontingent aufgebraucht, kein eigener Key). Nimmt
// den Nutzer "an die Hand" statt nur auf die Profil-Einstellung zu verweisen:
// Key lässt sich direkt in diesem Dialog anlegen und speichern.
const ApiKeyOnboardingModal = () => {
const [keyDraft, setKeyDraft] = useState('');
const [isSaving, setIsSaving] = useState(false);
const handleSave = async () => {
const trimmed = keyDraft.trim();
if (!trimmed) return;
setIsSaving(true);
try {
await saveOwnApiKey(trimmed);
setShowApiKeyOnboarding(false);
} finally {
setIsSaving(false);
}
};
return (
<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={() => setShowApiKeyOnboarding(false)}>
<div
className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm transform transition-all duration-300 scale-100 max-h-[90vh] overflow-y-auto"
onClick={e => e.stopPropagation()}
>
<div className="flex justify-between items-start border-b pb-3 mb-4">
<div>
<h3 className="text-lg font-bold text-gray-800 flex items-center">
<Zap className="w-5 h-5 mr-2 text-(--accent)" />
Kostenloses Kontingent aufgebraucht
</h3>
<p className="text-xs text-gray-500 mt-1">
Sie haben Ihre {FREE_TRIAL_MAX} kostenlosen Analysen aufgebraucht. Mit
einem eigenen, kostenlosen Gemini-API-Key können Sie SmartCraft sofort
weiter nutzen — in 4 kurzen Schritten.
</p>
</div>
<button onClick={() => setShowApiKeyOnboarding(false)} className="flex-shrink-0 text-gray-400 hover:text-gray-600 ml-2">
<X className="w-5 h-5" />
</button>
</div>
<ol className="space-y-3 text-sm text-gray-700 mb-4">
<li className="flex space-x-2">
<span className="flex-shrink-0 w-5 h-5 rounded-full bg-(--accent) text-white text-xs font-bold flex items-center justify-center">1</span>
<span>Öffnen Sie Google AI Studio und melden Sie sich mit einem Google-Konto an.</span>
</li>
<li className="flex space-x-2">
<span className="flex-shrink-0 w-5 h-5 rounded-full bg-(--accent) text-white text-xs font-bold flex items-center justify-center">2</span>
<span>Klicken Sie dort auf <strong>"Create API key"</strong> (kostenlos, kein Abo nötig).</span>
</li>
<li className="flex space-x-2">
<span className="flex-shrink-0 w-5 h-5 rounded-full bg-(--accent) text-white text-xs font-bold flex items-center justify-center">3</span>
<span>Kopieren Sie den erzeugten Key.</span>
</li>
<li className="flex space-x-2">
<span className="flex-shrink-0 w-5 h-5 rounded-full bg-(--accent) text-white text-xs font-bold flex items-center justify-center">4</span>
<span>Fügen Sie ihn unten ein und speichern Sie ihn.</span>
</li>
</ol>
<a
href="https://aistudio.google.com/apikey"
target="_blank"
rel="noopener noreferrer"
className="w-full flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-800 font-semibold rounded-xl hover:bg-gray-200 transition duration-300 text-sm mb-4"
>
<ExternalLink className="w-4 h-4 mr-2" />
Google AI Studio öffnen (aistudio.google.com/apikey)
</a>
<div className="flex space-x-2">
<input
type="password"
value={keyDraft}
onChange={(e) => setKeyDraft(e.target.value)}
placeholder="AIza..."
className="flex-grow min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-(--accent)"
/>
<button
onClick={handleSave}
disabled={isSaving || !keyDraft.trim()}
className="px-4 py-2 bg-(--accent) text-white text-sm font-semibold rounded-lg hover:bg-(--accent-dark) transition disabled:opacity-50 flex-shrink-0 flex items-center justify-center"
>
{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Speichern'}
</button>
</div>
<p className="text-[11px] text-gray-400 mt-3">
Der Key wird nur für Ihr eigenes Konto gespeichert und ausschließlich
serverseitig für Ihre eigenen KI-Anfragen genutzt. Google bietet für die
Gemini API ein kostenloses Kontingent — für den privaten Gebrauch fallen
in der Regel keine Kosten an.
</p>
<button
onClick={() => setShowApiKeyOnboarding(false)}
className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 transition"
>
Später erledigen
</button>
</div>
</div>
);
};
// Profil-Modal-Komponente (angepasst an Rot/Blau)
const UserProfileModal = () => {
const [showProfile, setShowProfile] = useState(false);
// Fällt auf das generische User-Icon zurück, falls das Google-Profilbild aus
// irgendeinem Grund nicht lädt (Hotlink-Schutz, CSP, Netzwerk) — sonst bliebe
// ein kaputtes Bild-Icon stehen statt eines brauchbaren Platzhalters.
const [googlePhotoFailed, setGooglePhotoFailed] = useState(false);
const showGooglePhoto = !!authUser?.photoURL && !googlePhotoFailed;
useEffect(() => { setGooglePhotoFailed(false); }, [authUser?.photoURL]);
// Eigener Gemini-API-Key (siehe ownApiKey/saveOwnApiKey oben in App): eigener
// Eingabe-Entwurf, damit ein Tippfehler nicht sofort den gespeicherten Key
// überschreibt — erst "Speichern" schreibt nach Firestore.
const [apiKeyDraft, setApiKeyDraft] = useState('');
const [isSavingApiKey, setIsSavingApiKey] = useState(false);
useEffect(() => { setApiKeyDraft(''); }, [showProfile]);
const handleSaveApiKey = async () => {
const trimmed = apiKeyDraft.trim();
if (!trimmed) return;
setIsSavingApiKey(true);
try {
await saveOwnApiKey(trimmed);
setApiKeyDraft('');
} finally {
setIsSavingApiKey(false);
}
};
const handleRemoveApiKey = async () => {
setIsSavingApiKey(true);
try {
await saveOwnApiKey(null);
} finally {
setIsSavingApiKey(false);
}
};
const handleSignOut = async () => {
// Nur Abmeldung, wenn Firebase aktiv ist
if (!auth || !userId) return;
try {
// Google-Login ist verpflichtend — nach der Abmeldung zeigt das Login-Gate
// (siehe "if (!isAuthReady || showAuth)") direkt wieder den Anmelde-Button,
// statt automatisch eine neue Sitzung zu starten.
await signOut(auth);
setShowProfile(false);
handleReset(); // App zurücksetzen
} catch (e) {
console.error("Logout Error:", e);
queueErrorReport('firebase-signout', e);
}
};
return (
<>
{/* Profil-Button im Header — feste Kreisgröße (w-10 h-10), damit ein Google-Foto
    randlos bis zum Rand füllt statt in einem gepolsterten Button zu "schweben" */}
<div className="relative flex flex-col items-center">
<span className="text-[10px] uppercase tracking-wide text-white/70 mb-0.5">PROFIL:</span>
<button
onClick={() => setShowProfile(true)} // Öffnet Profil-Modal
className={`w-10 h-10 flex items-center justify-center rounded-full ring-2 ring-white/70 ring-offset-2 ring-offset-transparent transition duration-200 overflow-hidden ${userId ? 'bg-white/20 hover:bg-white/30' : 'bg-gray-500/50 cursor-wait'}`}
disabled={!userId}
title="Benutzerprofil und Historie anzeigen"
>
{showGooglePhoto ? (
<img src={authUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setGooglePhotoFailed(true)} />
) : (
<User className="w-6 h-6 text-white" />
)}
</button>
</div>
{/* Profil Modal */}
{showProfile && (
<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={() => setShowProfile(false)}>
<div
className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-xs transform transition-all duration-300 scale-100"
onClick={e => e.stopPropagation()}
>
<div className="flex justify-between items-center border-b pb-3 mb-4">
<h3 className="text-xl font-bold text-gray-800 flex items-center">
{/* Profil-Icon folgt der Berufs-Akzentfarbe */}
<User className="w-5 h-5 mr-2 text-(--accent) transition-colors duration-500 ease-in-out" />
Mein Konto
</h3>
<button onClick={() => setShowProfile(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-light"><X className="w-6 h-6" /></button>
</div>
<div className="flex items-center space-x-3 mb-4 p-2 bg-gray-50 rounded-lg border border-gray-200">
{showGooglePhoto ? (
<img src={authUser.photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" onError={() => setGooglePhotoFailed(true)} />
) : (
<User className="w-10 h-10 p-2 bg-gray-200 rounded-full text-gray-500 flex-shrink-0" />
)}
<div className="min-w-0">
<p className="text-sm font-semibold text-gray-800 truncate">{authUser?.displayName || 'Google-Konto'}</p>
<p className="text-xs text-gray-500 truncate">{authUser?.email}</p>
{userId && (
<p className="text-[11px] text-gray-400 truncate" title={userId}>ID: {userId.slice(0, 6)}</p>
)}
</div>
</div>
{/* Eigener Gemini-API-Key: siehe api/gemini.js getUserOwnApiKey — greift,
    sobald FREE_TRIAL_MAX (kostenlose Analysen pro Konto) aufgebraucht ist. */}
<div className="pt-3 mt-1 border-t border-gray-200">
<p className="text-xs font-semibold text-gray-700 flex items-center mb-1">
<Zap className="w-3.5 h-3.5 mr-1 text-(--accent)" />
Eigener Gemini-API-Key
</p>
<p className="text-[11px] text-gray-500 mb-2">
{trialRemaining !== null && trialRemaining <= 0
? `Ihr kostenloses Kontingent von ${FREE_TRIAL_MAX} Analysen ist aufgebraucht. Hinterlegen Sie hier einen eigenen, kostenlosen Gemini-API-Key, um SmartCraft weiter zu nutzen — die Kosten laufen dann über Ihr eigenes Google-Konto.`
: `Optional: Hinterlegen Sie schon jetzt einen eigenen Gemini-API-Key. Nach den ersten ${FREE_TRIAL_MAX} kostenlosen Analysen wird automatisch dieser Key statt des zentralen Kontingents genutzt.`}
</p>
{ownApiKey ? (
<div className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
<span>Aktiv: ••••{ownApiKey.slice(-4)}</span>
<button onClick={handleRemoveApiKey} disabled={isSavingApiKey} className="text-red-600 hover:text-red-800 font-semibold disabled:opacity-50">
Entfernen
</button>
</div>
) : (
<div className="flex space-x-2">
<input
type="password"
value={apiKeyDraft}
onChange={(e) => setApiKeyDraft(e.target.value)}
placeholder="AIza..."
className="flex-grow min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-(--accent)"
/>
<button
onClick={handleSaveApiKey}
disabled={isSavingApiKey || !apiKeyDraft.trim()}
className="px-3 py-1.5 bg-(--accent) text-white text-xs font-semibold rounded-lg hover:bg-(--accent-dark) transition disabled:opacity-50 flex-shrink-0 flex items-center justify-center"
>
{isSavingApiKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Speichern'}
</button>
</div>
)}
<a
href="https://aistudio.google.com/apikey"
target="_blank"
rel="noopener noreferrer"
className="text-[10px] text-gray-400 hover:text-gray-600 underline mt-1 inline-block"
>
Eigenen Key kostenlos erstellen (aistudio.google.com)
</a>
</div>
<div className="flex justify-between space-x-2 mt-4">
<button
onClick={() => { setShowHistory(true); setShowProfile(false); }}
className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition duration-300 text-sm transform active:scale-[0.98]"
disabled={!userId}
>
<List className="w-4 h-4 mr-2" />
Historie
</button>
<button
onClick={handleSignOut}
// Rot, um auf den Verlust des Zugriffs bis zur erneuten Google-Anmeldung hinzuweisen
className="flex items-center px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition duration-300 text-sm transform active:scale-[0.98]"
>
<X className="w-4 h-4 mr-2" />
Abmelden
</button>
</div>
<button
onClick={() => { setShowAdmin(true); setShowProfile(false); }}
className="w-full mt-3 flex items-center justify-center text-xs text-gray-400 hover:text-gray-600 transition"
>
<Lock className="w-3 h-3 mr-1" />
Admin-Bereich
</button>
</div>
</div>
)}
</>
);
};
if (!isAuthReady) {
// Ladebildschirm während der Firebase-Authentifizierung
return (
<div
className="min-h-screen flex justify-center items-center bg-gray-800 bg-cover bg-center bg-fixed bg-no-repeat"
style={{ backgroundImage: "url(https://storage.googleapis.com/bacon-images-prod/gemini/app_builder/werkzeuge.jpg)" }}
>
<div className="absolute inset-0 bg-black/40 z-0"></div>
<div
style={{ '--accent': theme.accent }}
className='text-white p-6 bg-(--accent) rounded-xl max-w-sm text-center transition-colors duration-700 ease-in-out'
>
<Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
<p className='font-bold'>Starte Authentifizierung...</p>
</div>
</div>
);
}
if (showAuth) {
// Login-Gate: Die App ist ohne Google-Anmeldung nicht nutzbar.
return (
<div
className="min-h-screen flex justify-center items-center bg-gray-800 bg-cover bg-center bg-fixed bg-no-repeat"
style={{ backgroundImage: "url(https://storage.googleapis.com/bacon-images-prod/gemini/app_builder/werkzeuge.jpg)" }}
>
<div className="absolute inset-0 bg-black/40 z-0"></div>
<div
style={{ '--accent': theme.accent }}
className='relative z-10 text-white p-6 bg-(--accent) rounded-xl max-w-sm text-center transition-colors duration-700 ease-in-out space-y-4'
>
{/* Markenname groß + Versionsnummer klein darunter, siehe Kopfleiste der Haupt-App-Ansicht weiter unten (dort inline statt gestapelt) */}
<div>
<h1 className="text-4xl font-display font-bold tracking-wide">
<span className="text-gold-light" style={{ color: 'var(--color-gold-light)' }}>Sm@rt</span>
<span style={{ color: '#fff' }}>Craft</span>!
</h1>
<p className="text-xs font-sans font-light italic text-white/70 mt-1">(V{__APP_VERSION__})</p>
</div>
<User className="w-8 h-8 mx-auto" />
<p className='font-bold'>Anmeldung erforderlich</p>
<p className='text-sm text-white/90'>
Diese App erfordert eine Anmeldung mit einem Google-Konto.
</p>
<button
onClick={handleGoogleSignIn}
disabled={isGoogleSigningIn || !auth}
className="w-full flex items-center justify-center px-4 py-2 bg-white text-gray-800 font-semibold rounded-xl hover:bg-gray-100 transition duration-300 text-sm transform active:scale-[0.98] disabled:opacity-60"
>
{isGoogleSigningIn ? (
<Loader2 className="w-4 h-4 mr-2 animate-spin" />
) : (
<GoogleIcon className="w-4 h-4 mr-2" />
)}
Mit Google anmelden
</button>
{googleSignInError && (
<p className="text-xs text-red-100 break-words p-2 bg-red-900/40 rounded-lg border border-red-300/40">
{googleSignInError}
</p>
)}
</div>
</div>
);
}
// Haupt-App-Ansicht
return (
<div
className="min-h-screen p-4 sm:p-6 flex justify-center relative bg-gray-800 bg-cover bg-center bg-fixed bg-no-repeat"
style={{
backgroundImage: "url(https://storage.googleapis.com/bacon-images-prod/gemini/app_builder/werkzeuge.jpg)",
'--accent': theme.accent,
'--accent-dark': theme.accentDark,
'--accent-soft': theme.accentSoft,
}}
>
<div className="absolute inset-0 bg-gradient-to-b from-black/50 via-[#14314a]/60 to-black/70 z-0"></div>
<div className="w-full max-w-sm flex flex-col items-center relative z-10">
{/* Historie-Modal */}
{showHistory && (
<AnalysisHistoryModal
db={db}
userId={userId}
appId={appId}
onClose={() => setShowHistory(false)}
onSelect={handleSelectAnalysis}
/>
)}
{/* Admin-Modal (Fehlerreports) */}
{showAdmin && (
<AdminPanel
db={db}
appId={appId}
isAdmin={isAdmin}
onClose={() => setShowAdmin(false)}
/>
)}
{/* Impressum/Datenschutz-Modal */}
{showLegal && <LegalPanel onClose={() => setShowLegal(false)} />}
{/* Feedback-Modal */}
{showFeedback && (
<FeedbackModal
onClose={() => setShowFeedback(false)}
reporterInfo={{
displayName: authUser?.displayName || null,
email: authUser?.email || null,
isAnonymous: false,
}}
/>
)}
{/* Anleitung zum Hinterlegen eines eigenen API-Keys (siehe
    handleTrialExceededError) — öffnet sich automatisch bei Status 402. */}
{showApiKeyOnboarding && <ApiKeyOnboardingModal />}
{/* Header mit Profil-Button - Farbe folgt dem gewählten Beruf (weicher Übergang) */}
<header className="w-full p-5 header-ornate relative transition-colors duration-700 ease-in-out">
<HeaderPlate />
<div className="flex items-center justify-between relative z-10">
<div className="flex items-center space-x-3">
{/* EINGEBETTETES, STABILES LOGO (Lucide-Icons) */}
<SmarterCraftLogo onClick={handleReset} />
{/* Versionsnummer stammt aus package.json (siehe vite.config.js define: __APP_VERSION__) */}
<h1 className="text-2xl font-display font-bold text-gold-light tracking-wide" style={{ color: 'var(--color-gold-light)' }}>Sm@rt<span style={{ color: '#fff' }}>Craft</span>! <span className='text-xs font-sans font-light italic text-white/70'>(V{__APP_VERSION__})</span></h1>
</div>
{/* Profil-Button: Öffnet das Profil-Modal */}
<UserProfileModal />
</div>
<p className="text-sm text-white/80 mt-1 relative z-10 italic">Der Kollege in der Hosentasche.</p>
</header>
{/* Haupt-Content-Bereich */}
<main className="p-4 space-y-6 w-full panel-parchment backdrop-blur-md overflow-y-auto">
{/* PRO-KONTO-KONTINGENT-HINWEIS: informiert vorab über das Limit aus
    FREE_TRIAL_MAX (shared/trialLimit.js), statt dass Nutzer erst beim
    Fehlschlagen der Analyse davon erfahren. trialRemaining kommt live vom
    Server (api/trial-status.js beim Start, X-Trial-Remaining-Header nach
    jeder Anfrage, siehe updateTrialRemainingFromResponse) — solange es null
    ist (noch nicht geladen bzw. Tracking serverseitig aus), zeigt der Text
    nur die Obergrenze. Ist das Kontingent aufgebraucht und noch kein eigener
    API-Key hinterlegt, wird der Hinweis zur Warnung (rot statt blau). */}
{showTrialNotice && (
<div className={`p-3 border-l-4 rounded-xl shadow-md flex items-start space-x-3 ${!ownApiKey && trialRemaining === 0 ? 'bg-red-50 border-red-400 text-red-800' : 'bg-blue-50 border-blue-400 text-blue-800'}`}>
<Info className={`w-5 h-5 mt-1 flex-shrink-0 ${!ownApiKey && trialRemaining === 0 ? 'text-red-500' : 'text-blue-500'}`} />
<div className="flex-grow">
<p className="font-bold">
{ownApiKey ? 'Eigener API-Key aktiv' : trialRemaining === 0 ? 'Kostenloses Kontingent aufgebraucht' : 'Kostenloses Kontingent'}
</p>
<p className="text-xs">
{ownApiKey
? 'Analysen laufen über Ihren eigenen, im Profil hinterlegten Gemini-API-Key.'
: trialRemaining !== null
? (trialRemaining > 0
? `Noch ${trialRemaining} von ${FREE_TRIAL_MAX} kostenlosen Analysen für dieses Konto übrig.`
: `Bitte hinterlegen Sie im Profil einen eigenen Gemini-API-Key, um SmartCraft weiter zu nutzen.`)
: `Dieses Konto hat ${FREE_TRIAL_MAX} kostenlose Analysen, danach wird ein eigener Gemini-API-Key benötigt.`}
</p>
</div>
<button
onClick={() => setShowTrialNotice(false)}
className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-white transition ${!ownApiKey && trialRemaining === 0 ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}
title="Hinweis ausblenden"
>
<X className="w-4 h-4" />
</button>
</div>
)}
{/* EU AI ACT DISCLAIMER */}
{showDisclaimer && (
<div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg shadow-md flex items-start space-x-3">
<AlertTriangle className="w-5 h-5 mt-1 flex-shrink-0 text-red-600" />
<div className="flex-grow">
<p className="font-bold">WICHTIGER HAFTUNGSAUSSCHLUSS (EU AI ACT)</p>
<p className="text-xs">Die KI-Diagnose ist ein unterstützender Vorschlag und ersetzt keine professionelle Planung oder statische Bewertung. Führen Sie sicherheitsrelevante Arbeiten nur nach Prüfung durch einen zertifizierten Fachmann aus.</p>
</div>
<button
onClick={() => setShowDisclaimer(false)}
className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition"
title="Hinweis ausblenden"
>
<X className="w-4 h-4" />
</button>
</div>
)}
{/* 1. Beruf Auswahl */}
<section>
<h2 className="mb-3"><span className="badge-pill">1. Beruf auswählen</span></h2>
<div className="grid grid-cols-5 gap-2 p-3 bg-parchment-dark/60 rounded-xl border-2 border-gold/50 shadow-inner">
{TRADE_ICONS.map((trade) => (
<TradeButton
key={trade.name}
name={trade.name}
icon={trade.icon}
theme={TRADE_THEMES[trade.name]}
isSelected={selectedTrade === trade.name}
onClick={saveTradePreference} // Speichert direkt in Firestore
/>
))}
</div>
{selectedTrade && (
<p className="mt-3 text-sm text-gray-600 font-medium transition-colors duration-500 ease-in-out">Aktueller Beruf: <span className="text-(--accent) font-bold">{selectedTrade}</span></p>
)}
</section>
{/* 2. Problem dokumentieren & analysieren - ANPASSUNG AN BILDSTIL */}
<section>
<h2 className="mb-3"><span className="badge-pill">2. Problem dokumentieren &amp; analysieren</span></h2>
{/* NEUE STRUKTUR: Wie auf dem Bild (einheitliche Eingabekarte) */}
<div className="panel-parchment p-4 rounded-xl">
{/* Mini-Button-Leiste für Foto-Auswahl im Tab-Stil - Jetzt klarer als Dateiauswahl */}
<div className="flex space-x-4 text-sm font-semibold text-gray-700 mb-4 border-b pb-2 -mt-2">
{/* Foto direkt mit der Kamera aufnehmen: "capture" öffnet auf dem Handy die
    Kamera-App statt einer Dateiauswahl, damit die Analyse live auf der
    Baustelle passiert. Auf dem Desktop ohne Kamera fällt der Browser
    automatisch auf eine normale Dateiauswahl zurück. */}
<label htmlFor="camera-input" className="flex items-center space-x-1 cursor-pointer hover:text-(--accent) transition-colors duration-500 ease-in-out">
<Camera className="w-5 h-5 text-(--accent) transition-colors duration-500 ease-in-out" />
<span>Foto aufnehmen</span>
<input id="camera-input" type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
</label>
{/* Galerie: bewusst ohne "capture", damit auch ein bereits vorhandenes Foto ausgewählt werden kann */}
<label htmlFor="gallery-input" className="flex items-center space-x-1 cursor-pointer hover:text-(--accent) transition-colors duration-500 ease-in-out">
<Image className="w-5 h-5 text-(--accent) transition-colors duration-500 ease-in-out" />
<span>Galerie</span>
<input id="gallery-input" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
</label>
{/* Cloud Upload Placeholder */}
<label htmlFor="cloud-input" className="flex items-center space-x-1 cursor-pointer text-gray-400 transition" title="In Kürze verfügbar">
<Upload className="w-5 h-5" />
<span>Google Fotos</span>
</label>
</div>
{/* Bild-Vorschau und Beschreibung */}
<div className="mt-2">
{selectedImageBase64 && (
<div className="relative w-full h-48 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center mb-4">
<img
src={`data:image/jpeg;base64,${selectedImageBase64}`}
alt="Vorschau des ausgewählten Bauproblems"
className="object-cover w-full h-full"
/>
<button
onClick={() => setSelectedImageBase64(null)}
className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full text-xs hover:bg-black/70 transition"
title="Bild entfernen"
>
<X className="w-4 h-4" />
</button>
</div>
)}
{/* Beschreibung des Problems */}
<div>
<label htmlFor="problem-desc" className="sr-only">Problembeschreibung</label>
<textarea
id="problem-desc"
rows="2"
value={problemDescription}
onChange={(e) => setProblemDescription(e.target.value)}
placeholder="Z.B. 'Dachbalken zeigt Risse nach Feuchtigkeitsschaden.' (Optional)"
className="w-full p-2 border border-gray-300 rounded-lg focus:ring-orange-500 focus:border-orange-500 resize-none text-sm"
/>
</div>
</div>
</div>
{/* ANGEPASST: Reset-Button wieder neben dem Analyse-Button */}
<div className="flex space-x-3 mt-4 w-full">
{/* Reset Button */}
<button
onClick={handleReset}
className="w-1/3 flex items-center justify-center py-3 btn-parchment text-sm"
>
<RefreshCw className="w-4 h-4 mr-1" />
Zurücksetzen
</button>
{/* Primär Analyse Button - Quest-Button im Spiel-Look */}
<button
onClick={callGeminiVisionAPI}
disabled={isAnalyzing || (!selectedImageBase64 && problemDescription.trim().length === 0)}
className="w-2/3 flex items-center justify-center py-3 btn-quest transition duration-300"
>
{isAnalyzing ? (
<>
<Loader2 className="w-5 h-5 mr-2 animate-spin text-white" />
Analysiere...
</>
) : (
<>
<Zap className="w-5 h-5 mr-2" />
Problem analysieren
</>
)}
</button>
</div>
</section>
{/* Berufs-Spezial-Tools: direkt oberhalb des Analyseergebnisses, weiterhin
    schon ohne abgeschlossene Analyse nutzbar (siehe buildTradeToolQuery).
    Nur sichtbar, wenn der gewählte Beruf hinterlegte Tools hat. */}
{currentTradeTools.length > 0 && (
<section className="mt-6">
<h2 className="mb-3">
<span className="badge-pill inline-flex items-center gap-1">
<Sparkles className="w-3.5 h-3.5" />
{selectedTrade === 'Allround-Handwerker' ? 'Alle Berufs-Spezial-Tools' : `${selectedTrade}-Spezial-Tools`}
</span>
</h2>
<div className="panel-parchment p-4 rounded-xl">
<p className="text-xs text-gray-500 mb-3">
Direkt nutzbar, sobald ein Beruf gewählt ist — je genauer die Grundlage
(Diagnose &gt; Problembeschreibung &gt; nur der Beruf), desto konkreter die Antwort.
</p>
<div className="grid grid-cols-2 gap-3">
{currentTradeTools.map((tool) => {
const ToolIcon = tool.icon;
const isToolLoading = !!loadingTradeToolIds[tool.id];
return (
<button
key={tool.id}
onClick={() => callGeminiTradeToolAPI(tool)}
disabled={isToolLoading}
className="flex flex-col items-center justify-center p-2 rounded-xl font-bold text-white shadow-md transition duration-300 text-xs transform active:scale-[0.98] disabled:opacity-60"
style={{ backgroundColor: isToolLoading ? theme.accentDark : theme.accent }}
>
{isToolLoading ? (
<Loader2 className="w-4 h-4 animate-spin" />
) : (
<ToolIcon className="w-4 h-4" />
)}
<span className="mt-1">✨ {tool.label}</span>
</button>
);
})}
</div>
{/* Zeigt Ergebnisse ALLER Berufe an, nicht nur des aktuell gewählten -
    Ergebnisse stapeln sich beim Berufswechsel statt zu verschwinden, damit
    man völlig flexibel zwischen Berufen wechseln kann (siehe
    tradeToolResultEntries). Akzentfarbe/Herkunfts-Label folgen dabei dem
    ursprünglichen Beruf des jeweiligen Tools, nicht dem aktuell gewählten. */}
{tradeToolResultEntries.length > 0 && (
<div className="mt-4 space-y-3">
{tradeToolResultEntries.map(({ tool, text, trade }) => {
const ToolResultIcon = tool.icon;
const resultTheme = TRADE_THEMES[trade] || theme;
return (
<div key={tool.id} className="p-4 bg-white border border-gray-200 rounded-xl shadow-inner">
<div className="flex items-start justify-between mb-3">
<h4 className="text-md font-bold text-gray-800 flex items-center">
<ToolResultIcon className="w-5 h-5 mr-2" style={{ color: resultTheme.accent }} />
<span>
{tool.label}
{trade && trade !== selectedTrade && (
<span className="block text-xs font-normal text-gray-400">{trade}</span>
)}
</span>
</h4>
<button
onClick={() => setTradeToolResults((prev) => ({ ...prev, [tool.id]: null }))}
className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition"
title="Ergebnis entfernen"
>
<X className="w-4 h-4" />
</button>
</div>
<div className="text-sm text-gray-700 leading-relaxed">
<div dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br/>') }} />
</div>
</div>
);
})}
</div>
)}
{/* PDF-Export auch ohne abgeschlossene Diagnose: der Button im
    Analyseergebnis-Bereich (handleExportPdf) setzt sonst solutionText
    voraus, obwohl der Export selbst inzwischen auch nur mit Berufs-
    Spezial-Tool-Ergebnissen funktioniert. Nur hier zeigen, solange keine
    Diagnose vorliegt — sonst gibt es den Export-Button doppelt. */}
{!solutionText && tradeToolResultEntries.length > 0 && (
<div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
<button
onClick={handleExportPdf}
disabled={Object.values(loadingTradeToolIds).some(Boolean)}
className="flex items-center px-4 py-2 bg-(--accent) text-white font-semibold rounded-xl shadow-md hover:bg-(--accent-dark) transition-colors duration-500 ease-in-out transform active:scale-[0.98] disabled:opacity-60"
>
<FileText className="w-4 h-4 mr-2" />
Als PDF exportieren
</button>
</div>
)}
</div>
</section>
)}
{/* 3. Analyseergebnisse */}
<section className="mt-6">
<h2 className="mb-3"><span className="badge-pill">3. Ergebnis der KI-Analyse</span></h2>
{ResultDisplay}
</section>
</main>
<footer className="w-full text-center py-3 relative z-10">
<button
onClick={() => setShowLegal(true)}
className="text-[11px] text-white/60 hover:text-white/90 underline"
>
Impressum &amp; Datenschutz
</button>
</footer>
{/* Feedback-Button: freischwebend statt im Footer, damit er nicht neben
    "Impressum & Datenschutz" untergeht (siehe Nutzer-Feedback) */}
<button
onClick={() => setShowFeedback(true)}
className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-5 py-3.5 btn-gold"
aria-label="Feedback senden"
>
<MessageSquarePlus className="w-5 h-5" />
<span className="font-semibold text-sm">Feedback</span>
</button>
</div>
</div>
);
};
export default App;
