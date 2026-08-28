import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './index.css';

// Registriert den Service Worker (App-Shell-Cache fürs Offline-Starten, z.B.
// auf der Baustelle ohne Empfang). onNeedRefresh/onOfflineReady bleiben
// bewusst ohne UI-Prompt - "autoUpdate" (siehe vite.config.js) übernimmt neue
// Versionen automatisch beim nächsten Laden.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
