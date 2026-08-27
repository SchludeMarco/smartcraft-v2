// Rein clientseitige Ablage für Analysen inkl. Bildern via IndexedDB.
// Firestore (siehe saveAnalysis in App.jsx) speichert aus Größengründen kein
// Base64-Bild mit ("zu groß für Firestore") - diese optionale, vom Nutzer
// per Klick ausgelöste Ablage ergänzt das um den vollständigen Bildsatz,
// ohne serverseitigen Speicherplatz zu belasten.
const DB_NAME = 'smartcraft-local-analyses';
const STORE_NAME = 'analyses';
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

// Speichert eine Analyse inkl. Bilder lokal. images: Array aus
// {id, base64}, wie es der selectedImages-State in App.jsx führt.
export async function saveAnalysisLocally({ selectedTrade, problemDescription, solutionText, images }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    selectedTrade: selectedTrade || null,
    problemDescription: problemDescription || '',
    solutionText: solutionText || null,
    images: images || [],
  };
  await runTransaction('readwrite', (store) => store.add(entry));
  return entry;
}

// Neueste zuerst.
export async function getLocalAnalyses() {
  const results = await runTransaction('readonly', (store) => store.getAll());
  return (results || []).sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteLocalAnalysis(id) {
  await runTransaction('readwrite', (store) => store.delete(id));
}
