import React, { useState } from 'react';
import { X, MessageSquarePlus, Loader2, CheckCircle } from 'lucide-react';
import { sendFeedback } from './errorReporting';

const MAX_LENGTH = 2000;

// Feedback-Modal, aufrufbar über den Button im Footer von App.jsx. Anders als
// die Fehlerreports (errorReporting.js) ist das hier freiwillig vom Nutzer
// verfasster Text ohne technischen Kontext, siehe api/send-feedback.js.
const FeedbackModal = ({ onClose, reporterInfo }) => {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || status === 'sending') return;
    setStatus('sending');
    try {
      await sendFeedback(trimmed, reporterInfo);
      setStatus('sent');
    } catch {
      setStatus('error');
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
            <MessageSquarePlus className="w-5 h-5 mr-2 text-gray-600" />
            Feedback senden
          </h3>
          <button onClick={onClose} aria-label="Schließen" className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {status === 'sent' ? (
          <div className="py-6 flex flex-col items-center text-center gap-2">
            <CheckCircle className="w-10 h-10 text-green-600" />
            <p className="text-sm text-gray-700">Danke für dein Feedback!</p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700"
            >
              Schließen
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <p className="text-xs text-gray-500">
              Wünsche, Lob oder was dich stört — landet direkt beim Entwickler.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
              placeholder="Dein Feedback..."
              aria-label="Feedback-Nachricht"
              rows={5}
              autoFocus
              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">{message.length}/{MAX_LENGTH}</span>
              {status === 'error' && (
                <span className="text-[11px] text-red-600">Senden fehlgeschlagen, bitte erneut versuchen.</span>
              )}
            </div>
            <button
              type="submit"
              disabled={!message.trim() || status === 'sending'}
              className="mt-1 px-4 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {status === 'sending' ? 'Wird gesendet...' : 'Senden'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
