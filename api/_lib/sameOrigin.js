// Same-Origin-Schutz für alle /api/*-Endpoints: lehnt Requests ab, deren
// Origin-Header nicht zum eigenen Host passt — verhindert, dass fremde Seiten
// diese Endpoints als kostenlosen Proxy/Mail-Relais missbrauchen. Vorher in
// jeder Datei einzeln dupliziert (mit leicht auseinandergedrifteten Kopien,
// siehe allowRefererFallback unten).
//
// allowRefererFallback: einfache GET-Requests ohne Body/Custom-Header
// schicken je nach Browser keinen Origin-Header (anders als POST-Requests,
// die zuverlässig einen Origin-Header mitschicken) — nur dort greift der
// Referer-Fallback, bevor legitime Anfragen fälschlich mit 403 abgewiesen
// würden.
export function isSameOriginRequest(req, { allowRefererFallback = false } = {}) {
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
