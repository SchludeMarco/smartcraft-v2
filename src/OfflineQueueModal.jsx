import React, { useCallback, useEffect, useState } from 'react';
import { X, WifiOff, Image, Trash2, Loader2 } from 'lucide-react';
import { getQueuedAnalyses, removeQueuedAnalysis } from './offlineAnalysisQueue';
import { TRADE_THEMES, DEFAULT_TRADE } from './tradeThemes';

// Verwaltung der Analysen, die ohne Empfang ausgelöst und noch nicht
// automatisch nachgeholt wurden (siehe offlineAnalysisQueue.js). Anders als
// AnalysisHistoryModal (bereits abgeschlossene, in Firestore/lokal
// gespeicherte Analysen) zeigt dieses Modal Einträge, die noch GAR NICHT
// analysiert wurden — nur Bilder+Beschreibung+Beruf, wie sie beim Auslösen
// ohne Verbindung eingegeben wurden. "Bearbeiten" lädt einen Eintrag über
// onSelect zurück ins Hauptformular (App.jsx, editingQueuedId), wo er wie
// eine neue Analyse angepasst und erneut gespeichert bzw. bei bestehender
// Verbindung direkt analysiert werden kann.
const OfflineQueueModal = ({ onClose, onSelect }) => {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await getQueuedAnalyses());
    } catch (e) {
      console.error('Warteschlange konnte nicht geladen werden:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(async (e, id) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await removeQueuedAnalysis(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (e2) {
      console.error('Warteschlangen-Eintrag konnte nicht gelöscht werden:', e2);
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div
        className="panel-parchment p-6 rounded-2xl w-full max-w-md h-[80vh] flex flex-col transform transition-all duration-300 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b border-steel/40 pb-3 mb-4 flex-shrink-0">
          <h3 className="text-xl font-bold text-gray-800 flex items-center">
            <WifiOff className="w-5 h-5 mr-2 text-(--accent)" />
            Offline-Warteschlange
          </h3>
          <button onClick={onClose} aria-label="Schließen" className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4 flex-shrink-0">
          Ohne Empfang gespeicherte Analysen, die noch auf die automatische KI-Diagnose warten.
          Zum Bearbeiten oder sofortigen Auslösen (bei bestehender Verbindung) antippen.
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center flex-grow">
            <Loader2 className="w-6 h-6 text-(--accent) animate-spin" />
            <p className="ml-2 text-gray-600">Warteschlange wird geladen...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center p-8 text-gray-500 flex-grow">
            <WifiOff className="w-8 h-8 mx-auto mb-3" />
            <p>Keine gespeicherten Offline-Analysen. Löst man "Problem analysieren" ohne Empfang aus, landet sie hier.</p>
          </div>
        ) : (
          <ul className="space-y-3 overflow-y-auto flex-grow pr-1">
            {items.map((item) => {
              const theme = TRADE_THEMES[item.selectedTrade] || TRADE_THEMES[DEFAULT_TRADE];
              return (
                <li
                  key={item.id}
                  className="p-3 bg-parchment border border-steel/30 rounded-lg shadow-sm hover:bg-parchment-dark/50 transition duration-150 cursor-pointer flex items-center justify-between"
                  onClick={() => onSelect(item)}
                >
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleString('de-DE')}</p>
                    <p className="text-sm font-semibold text-gray-800 truncate max-w-[80%]">
                      {(item.problemDescription || '').trim() || `Analyse für Beruf: ${item.selectedTrade}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="inline-block px-2 py-0.5 text-xs font-medium rounded-full"
                        style={{ backgroundColor: theme.accentSoft, color: theme.accentDark }}
                      >
                        {item.selectedTrade || DEFAULT_TRADE}
                      </span>
                      {item.images?.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <Image className="w-3.5 h-3.5" /> {item.images.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, item.id)}
                      disabled={deletingId === item.id}
                      aria-label="Aus Warteschlange löschen"
                      title="Aus Warteschlange löschen"
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    >
                      {deletingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                    <span className="flex items-center text-(--accent) hover:text-(--accent-dark) text-sm font-semibold">
                      Bearbeiten
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="text-center mt-4 flex-shrink-0">
          <p className="text-xs text-gray-400">Wird automatisch der Reihe nach nachgeholt, sobald eine Verbindung besteht.</p>
        </div>
      </div>
    </div>
  );
};

export default OfflineQueueModal;
