import { getAdminApp, verifyAppCheck } from './_lib/firebaseAdmin.js';
import { isSameOrigin } from './_lib/sameOrigin.js';
import { checkFixedWindowRateLimit } from './_lib/rateLimit.js';
import { formatTimestamp, escapeHtml } from './_lib/email.js';

// Manuelles Nutzer-Feedback (Button in App.jsx) — anders als api/report-bug.js
// kein automatischer Trigger bei Fehlern, sondern ein bewusster Klick, daher
// kein Dedup nötig: jede Nachricht ist eigenständiger Inhalt und soll
// ankommen. Gleiches Schutzmuster (Same-Origin, App Check, Rate-Limit,
// Resend-Mail) wie beim Bug-Report, eigener Rate-Limit-Doc-Präfix, damit
// beide Endpoints sich nicht gegenseitig das Kontingent wegnehmen.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 3;
const RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_DAY = 20;
const MAX_MESSAGE_LENGTH = 2000;

async function checkRateLimit(app, ip) {
  return checkFixedWindowRateLimit(app, {
    collection: '_rateLimits',
    docId: `feedback_${ip}`,
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
    dayMs: RATE_LIMIT_DAY_MS,
    maxPerDay: RATE_LIMIT_MAX_PER_DAY,
  });
}

function buildEmail({ message, reporterInfo, appVersion, userAgent, timestamp }) {
  const subject = 'Sm@rtCraft: Neues Feedback';
  const from = reporterInfo?.isAnonymous === false
    ? `${reporterInfo.displayName || 'Unbekannt'} (${reporterInfo.email || 'keine E-Mail'})`
    : 'Anonymer Nutzer';
  const html = [
    `<p><strong>Von:</strong> ${escapeHtml(from)}</p>`,
    `<p><strong>Zeitpunkt:</strong> ${escapeHtml(formatTimestamp(timestamp))}</p>`,
    `<p><strong>App-Version:</strong> ${escapeHtml(appVersion || 'unbekannt')}</p>`,
    `<p><strong>Gerät (User-Agent):</strong> ${escapeHtml(userAgent || 'unbekannt')}</p>`,
    `<p><strong>Nachricht:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
  ].join('\n');
  return { subject, html };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Gleicher Same-Origin-Schutz wie api/report-bug.js/api/gemini.js.
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const app = getAdminApp();
  if (app) {
    const appCheckOk = await verifyAppCheck(req, app);
    if (!appCheckOk) {
      res.status(401).json({ error: 'Forbidden: invalid App Check token' });
      return;
    }
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const withinLimit = await checkRateLimit(app, ip);
    if (!withinLimit) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT_KEY nicht gesetzt — App Check/Rate-Limiting für /api/send-feedback deaktiviert.');
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.SUPPORT_EMAIL || process.env.VITE_ADMIN_EMAIL;
  if (!apiKey || !recipient) {
    console.error('/api/send-feedback: RESEND_API_KEY oder SUPPORT_EMAIL/VITE_ADMIN_EMAIL fehlt — Mail-Versand übersprungen.');
    res.status(500).json({ error: 'Server misconfigured: RESEND_API_KEY/SUPPORT_EMAIL missing' });
    return;
  }
  const from = process.env.RESEND_FROM_EMAIL || 'Sm@rtCraft Bug-Report <onboarding@resend.dev>';

  const { message, reporterInfo, appVersion, userAgent, timestamp } = req.body || {};
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  if (!trimmedMessage) {
    res.status(400).json({ error: 'Missing message' });
    return;
  }

  const { subject, html } = buildEmail({
    message: trimmedMessage.slice(0, MAX_MESSAGE_LENGTH),
    reporterInfo,
    appVersion,
    userAgent,
    timestamp,
  });

  try {
    const upstream = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipient, subject, html }),
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('Resend-Versand fehlgeschlagen:', upstream.status, text);
      res.status(502).json({ error: 'Email send failed' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Resend-Request fehlgeschlagen:', error);
    res.status(502).json({ error: 'Upstream email request failed' });
  }
}
