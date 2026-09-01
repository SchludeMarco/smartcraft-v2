// Gemeinsame Formatierungshelfer für die Resend-Mails aus report-bug.js und
// send-feedback.js.
export const formatTimestamp = (ms) => (ms ? new Date(ms).toLocaleString('de-DE') : 'Unbekannt');

export const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
