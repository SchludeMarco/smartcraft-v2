// Same-Origin-Schutz für alle api/*.js-Endpoints: verhindert, dass fremde
// Seiten diese Serverless Functions als kostenlosen Proxy (Gemini/TTS) oder
// Mail-Relais (Feedback/Bug-Report) missbrauchen.
//
// allowRefererFallback=true (nur für einfache GET-Endpoints wie
// demo-status.js/trial-status.js/app-start.js gedacht): manche Browser
// schicken bei GET-Requests ohne Body/Custom-Header keinen Origin-Header,
// anders als die POST-Requests an /api/gemini & Co, die zuverlässig einen
// Origin-Header mitschicken.
export function isSameOrigin(req, { allowRefererFallback = false } = {}) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let originHost = null;
  try {
    originHost = req.headers.origin ? new URL(req.headers.origin).host : null;
  } catch {
    originHost = null;
  }
  if (!originHost && allowRefererFallback) {
    try {
      originHost = req.headers.referer ? new URL(req.headers.referer).host : null;
    } catch {
      originHost = null;
    }
  }
  return !!originHost && originHost === host;
}
