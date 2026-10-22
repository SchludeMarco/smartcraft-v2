import React, { useState, useCallback, useEffect } from 'react';
import { Loader2, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { fetchGuests, addGuest, removeGuest } from './guests';
import { guestDocId, isValidGuestEmail } from '../shared/guests.js';

const formatDate = (ms) => (ms ? new Date(ms).toLocaleDateString('de-DE') : '');

// Admin-Bereich, Tab "Gäste": wer Sm@rtCraft nutzen darf ("Nur für
// Eingeladene", siehe src/guests.js / api/_lib/guests.js). Liest und schreibt
// direkt die Firestore-Gästeliste — firestore.rules erlaubt das nur Konten mit
// Admin-Claim, die Prüfung hier ist also kein bloßer UI-Schutz.
const GuestList = ({ db, appId }) => {
  const [guests, setGuests] = useState([]);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setGuests(await fetchGuests(db, appId));
    } catch (e) {
      console.error('Gästeliste laden fehlgeschlagen:', e);
      setError('Fehler beim Laden: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  }, [db, appId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const address = guestDocId(email);
    if (!isValidGuestEmail(address)) {
      setError('Bitte eine gültige Google-Adresse eingeben.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addGuest(db, appId, address);
      setEmail('');
      await load();
    } catch (err) {
      console.error('Gast einladen fehlgeschlagen:', err);
      setError('Einladen fehlgeschlagen: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (address) => {
    if (!window.confirm(`${address} von der Gästeliste nehmen?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeGuest(db, appId, address);
      setGuests((prev) => prev.filter((g) => g.email !== address));
    } catch (err) {
      console.error('Gast entfernen fehlgeschlagen:', err);
      setError('Entfernen fehlgeschlagen: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col flex-grow min-h-0">
      <p className="text-xs text-gray-600 mb-3 flex-shrink-0">
        Sm@rtCraft öffnet sich nur für diese Google-Konten (und Admin-Konten). Gäste melden sich mit genau dieser
        Adresse bei Google an. Entfernen greift spätestens nach einer Minute.
      </p>
      <form onSubmit={handleAdd} className="flex gap-2 mb-3 flex-shrink-0">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@gmail.com"
          aria-label="Google-Adresse des Gasts"
          className="flex-grow min-w-0 px-3 py-2 border border-gray-300 rounded-xl text-sm"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="flex items-center px-3 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition text-sm disabled:opacity-50"
        >
          <UserPlus className="w-4 h-4 mr-1" />
          Einladen
        </button>
      </form>
      {error && (
        <div className="p-2 mb-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg text-xs flex-shrink-0">{error}</div>
      )}
      <div className="flex justify-between items-center mb-1 flex-shrink-0">
        <p className="text-xs text-gray-500">{guests.length} eingeladen</p>
        <button onClick={load} disabled={isLoading} className="flex items-center text-xs text-blue-600 hover:text-blue-800 font-semibold">
          <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          Aktualisieren
        </button>
      </div>
      {isLoading && guests.length === 0 ? (
        <div className="flex items-center justify-center flex-grow">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : guests.length === 0 ? (
        <div className="text-center p-8 text-gray-500 flex-grow text-sm">
          <p>Noch niemand eingeladen.</p>
        </div>
      ) : (
        <ul className="space-y-1 overflow-y-auto flex-grow pr-1">
          {guests.map((g) => (
            <li key={g.email} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-sm text-gray-800 break-all">{g.email}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                {g.invitedAt && <span className="text-[11px] text-gray-400">seit {formatDate(g.invitedAt)}</span>}
                <button
                  onClick={() => handleRemove(g.email)}
                  disabled={busy}
                  title="Von der Gästeliste nehmen"
                  aria-label={`${g.email} von der Gästeliste nehmen`}
                  className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default GuestList;
