import React, { useState } from 'react';
import { X, Share2, Copy, CheckCircle, Send, Mail } from 'lucide-react';

// Einfaches WhatsApp-Glyphen-SVG, da lucide-react keine Marken-Icons führt.
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.41-1.42a9.86 9.86 0 0 0 4.63 1.18h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.07c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.79-.11-.41-.13-.94-.3-1.62-.6-2.85-1.23-4.71-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09.99-2.37.26-.28.57-.35.76-.35.19 0 .38 0 .55.01.17.01.41-.07.64.49.24.58.81 2 .88 2.15.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.93 1.93 1.22 2.21 1.36.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.54.32.07.12.07.65-.17 1.33Z" />
  </svg>
);

// Freigabe-Modal, aufrufbar über den Share-Button beim Analyseergebnis in
// App.jsx. Baut aus dem aktuellen Analyseergebnis (siehe shareText in
// App.jsx, analog zu handleExportPdf) einen reinen Text auf, da nicht alle
// Zielplattformen (WhatsApp, Telegram, E-Mail) formatiertes HTML annehmen.
const ShareModal = ({ onClose, shareText }) => {
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const encodedText = encodeURIComponent(shareText);
  const whatsappUrl = `https://wa.me/?text=${encodedText}`;
  const telegramUrl = `https://t.me/share/url?url=&text=${encodedText}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent('Sm@rtCraft Analyse')}&body=${encodedText}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard-API evtl. nicht verfügbar (z.B. kein HTTPS/älterer Browser) - stiller Fallback
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: 'Sm@rtCraft Analyse', text: shareText });
    } catch {
      // Nutzer hat den Share-Dialog abgebrochen - kein Fehler nötig
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b pb-3 mb-4 flex-shrink-0">
          <h3 className="text-xl font-bold text-gray-800 flex items-center">
            <Share2 className="w-5 h-5 mr-2 text-gray-600" />
            Analyse teilen
          </h3>
          <button onClick={onClose} aria-label="Schließen" className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#25D366] text-white font-semibold hover:bg-[#1ebe5a] transition-colors"
          >
            <WhatsAppIcon />
            WhatsApp
          </a>
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#229ED9] text-white font-semibold hover:bg-[#1c85b8] transition-colors"
          >
            <Send className="w-5 h-5" />
            Telegram
          </a>
          <a
            href={mailUrl}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-700 text-white font-semibold hover:bg-gray-600 transition-colors"
          >
            <Mail className="w-5 h-5" />
            E-Mail
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 transition-colors"
          >
            {copied ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
            {copied ? 'Kopiert!' : 'Text kopieren'}
          </button>
          {canNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 transition-colors"
            >
              <Share2 className="w-5 h-5" />
              Weitere Optionen...
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
