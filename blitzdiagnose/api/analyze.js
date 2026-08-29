// Serverless-Proxy vor der Gemini API, analog zum bewährten Muster aus
// api/gemini.js im Sm@rtCraft-Hauptprojekt (../api/gemini.js) - hier bewusst
// ohne Firebase/Login/Firestore, siehe README.md in diesem Ordner für die
// Abwägung.

// "-lite"-Alias statt fest gepinnter Version oder des einfachen
// "gemini-flash-latest": im Hauptprojekt (api/gemini.js) dokumentiert, dass
// gemini-flash-latest zeitweise komplett hing und das gepinnte
// Nachfolgemodell als "Thinking"-Modell zu langsam fürs Zeitbudget von
// Vercel-Functions war. gemini-flash-lite-latest lief dort durchgehend in
// 0-3s bei gleichbleibend guter Qualität.
const MODEL_NAME = 'gemini-flash-lite-latest';

// Ohne diese Angabe gilt Vercels Default-Timeout von 10s, das für einen
// Gemini-Vision-Aufruf knapp werden kann (siehe api/gemini.js im
// Hauptprojekt).
export const config = { maxDuration: 30 };

const SYSTEM_PROMPT = `Du bist ein hilfsbereiter Alltags-Experte, der ein Foto eines beliebigen
Problems oder Gegenstands sieht (Haushalt, Technik, Garten, Handwerk,
Pflanzen/Tiere, Kochen, uvm.) und dem Nutzer in Sekunden weiterhilft.

Erkenne selbstständig, worum es auf dem Foto geht - der Nutzer wählt keine
Kategorie vor. Beschreibe kurz, was zu sehen ist und welches Problem
erkennbar ist, und gib 3-6 konkrete, direkt umsetzbare Tipps zur Lösung.

Bei allem, das eine Gefahr darstellen könnte (Strom, Gas, Statik/Einsturz,
Gesundheit) setze riskLevel auf "gefahr" und rate klar dazu, eine
Fachperson (Handwerker, Elektriker, Arzt, ...) hinzuzuziehen statt selbst zu
experimentieren. Bei harmlosen Dingen mit etwas Vorsicht (z.B. scharfe
Kanten, Chemikalien) "vorsicht", ansonsten "gering".

Antworte immer auf Deutsch, knapp, konkret und ohne Floskeln.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Kurzer Titel, was auf dem Foto zu sehen ist / worum es geht' },
    category: { type: 'STRING', description: 'Selbst erkannte Kategorie, z.B. "Haushalt", "Technik", "Garten", "Pflanze", "Handwerk"' },
    summary: { type: 'STRING', description: 'Kurze Einschätzung des erkennbaren Problems, 1-3 Sätze' },
    riskLevel: { type: 'STRING', enum: ['gering', 'vorsicht', 'gefahr'] },
    tips: { type: 'ARRAY', items: { type: 'STRING' }, description: '3-6 konkrete, umsetzbare Tipps' },
  },
  required: ['title', 'category', 'summary', 'riskLevel', 'tips'],
};

// Best-effort In-Memory-Rate-Limit pro IP (12/Minute) statt des
// Firestore-Zählers aus dem Hauptprojekt (api/gemini.js): diese App kommt
// bewusst ohne Firebase aus (siehe README.md), daher kein Schutz über
// mehrere Vercel-Instanzen/Kaltstarts hinweg - bremst aber einfachen
// Missbrauch oder einen fehlerhaften Client-Loop innerhalb einer warmen
// Instanz.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 12;
const hits = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Nur Requests vom eigenen Frontend akzeptieren (gleiches Muster wie
    // api/gemini.js im Hauptprojekt) - verhindert, dass fremde Seiten diesen
    // Endpoint als kostenlosen Gemini-Proxy nutzen und Kosten verursachen.
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let originHost = null;
    try {
      originHost = req.headers.origin ? new URL(req.headers.origin).host : null;
    } catch {
      originHost = null;
    }
    if (!originHost || originHost !== host) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Zu viele Anfragen, bitte kurz warten.' });
      return;
    }

    const { image, mimeType } = req.body || {};
    if (!image || typeof image !== 'string' || !mimeType) {
      res.status(400).json({ error: 'image (base64) und mimeType erforderlich' });
      return;
    }
    // Grobe Absicherung gegen zu große Payloads, bevor Vercels hartes
    // 4,5MB-Limit als kryptisches FUNCTION_PAYLOAD_TOO_LARGE durchschlägt
    // (siehe README im Hauptprojekt zum selben Problem bei unkomprimierten
    // Handyfotos) - der Client komprimiert bereits vorab (src/imageCompress.js).
    if (image.length > 6_000_000) {
      res.status(413).json({ error: 'Bild zu groß, bitte erneut versuchen.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server misconfigured: GEMINI_API_KEY missing' });
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Analysiere dieses Foto und gib eine Einschätzung mit konkreten Tipps.' },
            { inlineData: { mimeType, data: image } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    let upstream;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error('Upstream-Gemini-Aufruf fehlgeschlagen:', error);
      res.status(502).json({ error: 'Upstream Gemini request failed' });
      return;
    }

    const upstreamJson = await upstream.json().catch(() => null);
    if (!upstream.ok || !upstreamJson) {
      console.error('Gemini-Fehlerantwort:', upstream.status, upstreamJson);
      res.status(upstream.status || 502).json({ error: upstreamJson?.error?.message || 'Gemini-Anfrage fehlgeschlagen' });
      return;
    }

    const text = upstreamJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: 'Keine Antwort von Gemini erhalten (evtl. Sicherheitsfilter).' });
      return;
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      console.error('Gemini-Antwort konnte nicht als JSON geparst werden:', text);
      res.status(502).json({ error: 'Unerwartetes Antwortformat von Gemini.' });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Unerwarteter Fehler in /api/analyze:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error: ' + (error?.message || String(error)) });
    }
  }
}
