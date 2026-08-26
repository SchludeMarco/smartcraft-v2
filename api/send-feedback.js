import { getAdminApp, verifyAppCheck } from './_lib/adminApp.js';
import { isSameOriginRequest } from './_lib/sameOrigin.js';
import { checkFixedWindowRateLimit } from './_lib/rateLimit.js';
import { formatTimestamp, escapeHtml, sendTransactionalEmail } from './_lib/email.js';

// Manuelles Nutzer-Feedback (Button in App.jsx) — anders als api/report-bug.js
// kein automatischer Trigger bei Fehlern, sondern ein bewusster Klick, daher
// kein Dedup nötig: jede Nachricht ist eigenständiger Inhalt und soll
// ankommen. Gleiches Schutzmuster (Same-Origin, App Check, Rate-Limit,
// Resend-Mail) wie beim Bug-Report, eigener Rate-Limit-Doc-Präfix, damit
// beide Endpoints sich nicht gegenseitig das Kontingent wegnehmen.
const RATE_LIMIT_MAX_PER_WINDOW = 3;
const RATE_LIMIT_MAX_PER_DAY = 20;
const MAX_MESSAGE_LENGTH = 2000;

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
  if (!isSameOriginRequest(req)) {
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
    const withinLimit = await checkFixedWindowRateLimit(app, '_rateLimits', `feedback_${ip}`, {
      maxPerWindow: RATE_LIMIT_MAX_PER_WINDOW,
      maxPerDay: RATE_LIMIT_MAX_PER_DAY,
    });
    if (!withinLimit) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT_KEY nicht gesetzt — App Check/Rate-Limiting für /api/send-feedback deaktiviert.');
  }

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

  await sendTransactionalEmail(res, { subject, html, endpointLabel: '/api/send-feedback' });
}
