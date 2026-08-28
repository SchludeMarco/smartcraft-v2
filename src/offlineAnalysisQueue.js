// Warteschlange für Analysen, die OHNE Empfang ausgelöst wurden (siehe
// callGeminiVisionAPI in App.jsx). Speichert Bilder+Beschreibung+Beruf
// vollständig lokal per IndexedDB (Firestore wäre hier ungeeignet: keine
// Schreibvorgänge ohne Verbindung möglich, und die Base64-Bilder wären für
// ein Firestore-Dokument ohnehin zu groß, siehe saveAnalysis). Sobald die
// Verbindung zurück ist, verarbeitet App.jsx die Einträge der Reihe nach via
// api/gemini.js und legt das Ergebnis ganz normal in Firestore ab.
const DB_NAME = 'smartcraft-offline-queue';
const STORE_NAME = 'pending-analyses';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB wird von diesem Browser nicht unterstützt.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = work(store);
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// images: Array aus {id, base64}, wie es der selectedImages-State in
// App.jsx führt.
export async function queueOfflineAnalysis({ selectedTrade, problemDescription, images }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    selectedTrade: selectedTrade || null,
    problemDescription: problemDescription || '',
    images: images || [],
  };
  await runTransaction('readwrite', (store) => store.add(entry));
  return entry;
}

// Älteste zuerst — Reihenfolge, in der die Analysen ausgelöst wurden.
export async function getQueuedAnalyses() {
  const results = await runTransaction('readonly', (store) => store.getAll());
  return (results || []).sort((a, b) => a.timestamp - b.timestamp);
}

export async function removeQueuedAnalysis(id) {
  await runTransaction('readwrite', (store) => store.delete(id));
}

// Überschreibt Beruf/Beschreibung/Bilder eines bestehenden Warteschlangen-
// Eintrags (siehe "Warteschlange verwalten" in App.jsx) — der Nutzer kann so
// eine bereits gespeicherte Offline-Analyse vor dem automatischen Nachholen
// noch anpassen, statt sie löschen und neu anlegen zu müssen. timestamp
// bleibt bewusst unverändert, damit die FIFO-Reihenfolge beim Nachholen
// erhalten bleibt. Löst bei unbekannter id (z.B. zwischenzeitlich bereits
// nachgeholt) nicht auf ein Objekt auf, sondern auf null.
export async function updateQueuedAnalysis(id, patch) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let updated = null;
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) return;
      updated = { ...existing, ...patch };
      store.put(updated);
    };
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
