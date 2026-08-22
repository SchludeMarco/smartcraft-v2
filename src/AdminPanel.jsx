import React, { useState, useCallback, useEffect } from 'react';
import { Lock, Bug, Mail, X, Loader2, ChevronDown, ChevronUp, RefreshCw, CheckCircle2, RotateCcw, MapPin, Eye, Trash2 } from 'lucide-react';
import {
  fetchAllErrorReports,
  fetchResolvedContexts,
  setContextResolved,
  getErrorContextInfo,
  fetchAppStarts,
  fetchAppStartsReviewedAt,
  markAppStartsReviewed,
  deleteAllAppStarts,
} from './errorReporting';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

if (!ADMIN_EMAIL) {
  // Kein Blocker, aber ohne Adresse bleibt der Mailto-Link im Bug-Report leer.
  console.warn('VITE_ADMIN_EMAIL ist nicht gesetzt – Mailto-Link im Admin-Bereich fehlt.');
}

const formatTimestamp = (ms) => (ms ? new Date(ms).toLocaleString('de-DE') : 'Unbekannt');

const OLD_REPORT_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;
const isOldReport = (report) => !report.timestamp || Date.now() - report.timestamp > OLD_REPORT_THRESHOLD_MS;

const buildMailto = (report) => {
  const info = getErrorContextInfo(report.context);
  const subject = `Sm@rtCraft Fehlerreport: ${info.label}`;
  const body = [
    `Kontext: ${report.context}`,
    `Zeitpunkt: ${formatTimestamp(report.timestamp)}`,
    `App-Version: ${report.appVersion || 'unbekannt'}`,
    `User-Agent: ${report.userAgent || 'unbekannt'}`,
    `Firestore-Pfad: ${report.path || 'unbekannt'}`,
    '',
    'Fehlermeldung:',
    report.message || '(keine Meldung)',
    '',
    'Vermutliche Ursache:',
    info.cause,
    '',
    'Lösungsansatz:',
    info.fix,
    '',
    'Stacktrace (ggf. gekürzt):',
    (report.stack || '(kein Stacktrace)').slice(0, 1000),
  ].join('\n');
  return `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

// Admin-Bereich: Übersicht aller Fehlerreports (Collection-Group-Query über alle
// Nutzer, siehe fetchAllErrorReports). Zugriff hängt am Firebase Custom Claim
// "admin: true" (isAdmin-Prop, gesetzt via scripts/set-admin-claim.mjs) — das ist
// ein echter Zugriffsschutz, durchgesetzt in firestore.rules, nicht nur UI-Gating.
const AdminPanel = ({ db, appId, isAdmin, onClose }) => {
  const [reports, setReports] = useState([]);
  const [resolvedContexts, setResolvedContexts] = useState({});
  const [appStarts, setAppStarts] = useState([]);
  const [appStartsReviewedAt, setAppStartsReviewedAt] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [hideResolved, setHideResolved] = useState(true);
  const [hideOld, setHideOld] = useState(true);
  const [togglingContext, setTogglingContext] = useState(null);
  const [isReviewingStarts, setIsReviewingStarts] = useState(false);
  const [isDeletingStarts, setIsDeletingStarts] = useState(false);

  const loadReports = useCallback(async () => {
    if (!db) {
      setLoadError('Datenbank nicht bereit.');
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const [data, resolved, starts, reviewedAt] = await Promise.all([
        fetchAllErrorReports(db),
        fetchResolvedContexts(db, appId),
        fetchAppStarts(db, appId),
        fetchAppStartsReviewedAt(db, appId),
      ]);
      setReports(data);
      setResolvedContexts(resolved);
      setAppStarts(starts);
      setAppStartsReviewedAt(reviewedAt);
    } catch (e) {
      console.error('Fehler beim Laden der Fehlerreports:', e);
      setLoadError('Fehler beim Laden: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  }, [db, appId]);

  const handleReviewStarts = async () => {
    setIsReviewingStarts(true);
    try {
      const reviewedAt = await markAppStartsReviewed(db, appId);
      setAppStartsReviewedAt(reviewedAt);
    } catch (e) {
      console.error('Als gelesen markieren fehlgeschlagen:', e);
    } finally {
      setIsReviewingStarts(false);
    }
  };

  const handleDeleteAllStarts = async () => {
    if (!window.confirm(`Wirklich alle ${appStarts.length} App-Start-Log-Einträge unwiderruflich löschen?`)) return;
    setIsDeletingStarts(true);
    try {
      await deleteAllAppStarts(db, appId);
      setAppStarts([]);
    } catch (e) {
      console.error('Löschen des App-Start-Logs fehlgeschlagen:', e);
    } finally {
      setIsDeletingStarts(false);
    }
  };

  const toggleResolved = async (context, resolved) => {
    setTogglingContext(context);
    try {
      const updated = await setContextResolved(db, appId, context, resolved, {
        resolvedInVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null,
      });
      setResolvedContexts(updated);
    } catch (e) {
      console.error('Fehler beim Aktualisieren des Status:', e);
    } finally {
      setTogglingContext(null);
    }
  };

  // Panel kann jederzeit geöffnet werden (siehe App.jsx "Admin-Bereich"-Button) —
  // erst hier greift die echte Prüfung. isAdmin kommt aus dem ID-Token-Claim und
  // kann sich ändern (z.B. nach frischer Anmeldung), daher als Effekt statt nur
  // beim ersten Mount.
  useEffect(() => {
    if (isAdmin) loadReports();
  }, [isAdmin, loadReports]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b pb-3 mb-4 flex-shrink-0">
          <h3 className="text-xl font-bold text-gray-800 flex items-center">
            <Bug className="w-5 h-5 mr-2 text-red-600" />
            Admin: Fehlerreports
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-light">
            <X className="w-6 h-6" />
          </button>
        </div>

        {!isAdmin ? (
          <div className="flex flex-col items-center justify-center flex-grow text-center">
            <Lock className="w-8 h-8 text-gray-400 mb-3" />
            <p className="text-sm text-gray-600">Kein Admin-Zugriff für dieses Konto.</p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-1 flex-shrink-0">
              <p className="text-xs text-gray-500">{reports.length} Report{reports.length === 1 ? '' : 's'} insgesamt</p>
              <button onClick={loadReports} disabled={isLoading} className="flex items-center text-xs text-blue-600 hover:text-blue-800 font-semibold">
                <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Aktualisieren
              </button>
            </div>
            {appStarts.length > 0 && (
              <div className="mb-3 flex-shrink-0 border border-gray-200 rounded-lg p-2 bg-gray-50">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <p className="text-xs font-semibold text-gray-600 flex items-center">
                    <MapPin className="w-3 h-3 mr-1" /> Letzte {appStarts.length} App-Starts (grobe Region)
                  </p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handleReviewStarts}
                      disabled={isReviewingStarts}
                      title="Alle als gelesen markieren"
                      className="text-gray-400 hover:text-blue-600 disabled:opacity-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleDeleteAllStarts}
                      disabled={isDeletingStarts}
                      title="Alle löschen"
                      className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                  {appStarts.map((entry) => {
                    const location = [entry.city, entry.country].filter((v) => v && v !== 'Unbekannt').join(', ') || 'Unbekannt';
                    const isNew = entry.timestamp > appStartsReviewedAt;
                    return (
                      <li key={entry.id} className="text-[11px] text-gray-600 flex justify-between gap-2">
                        <span className="flex items-center gap-1">
                          {isNew && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Neu seit letztem Lesen" />}
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        <span className="text-right">
                          {location}
                          {entry.visitorId && (
                            <span className="text-gray-400" title={entry.visitorId}>
                              {' '}· {entry.visitorId.slice(0, 6)}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <label className="flex items-center mb-3 flex-shrink-0 text-xs text-gray-600 select-none">
              <input
                type="checkbox"
                checked={hideResolved}
                onChange={(e) => setHideResolved(e.target.checked)}
                className="mr-1.5"
              />
              Gelöste ausblenden
            </label>
            <label className="flex items-center mb-3 flex-shrink-0 text-xs text-gray-600 select-none">
              <input
                type="checkbox"
                checked={hideOld}
                onChange={(e) => setHideOld(e.target.checked)}
                className="mr-1.5"
              />
              Alte ausblenden (älter als 14 Tage)
            </label>
            {isLoading ? (
              <div className="flex items-center justify-center flex-grow">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            ) : loadError ? (
              <div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg text-sm">{loadError}</div>
            ) : reports.length === 0 ? (
              <div className="text-center p-8 text-gray-500 flex-grow">
                <p>Keine Fehlerreports vorhanden.</p>
              </div>
            ) : (() => {
              let visibleReports = reports;
              if (hideResolved) visibleReports = visibleReports.filter((r) => !resolvedContexts[r.context]);
              if (hideOld) visibleReports = visibleReports.filter((r) => !isOldReport(r));
              return visibleReports.length === 0 ? (
                <div className="text-center p-8 text-gray-500 flex-grow">
                  <p>Keine aktuellen offenen Fehlerreports. Alle passenden Reports sind gelöst oder älter als 14 Tage.</p>
                </div>
              ) : (
              <ul className="space-y-3 overflow-y-auto flex-grow pr-1">
                {visibleReports.map((report) => {
                  const info = getErrorContextInfo(report.context);
                  const isExpanded = expandedId === report.id;
                  const resolution = resolvedContexts[report.context];
                  const isResolved = !!resolution;
                  return (
                    <li key={report.id} className={`border rounded-lg shadow-sm overflow-hidden ${isResolved ? 'border-green-200 opacity-70' : 'border-gray-200'}`}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : report.id)}
                        className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 transition flex items-start justify-between"
                      >
                        <div className="flex-grow pr-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500">{formatTimestamp(report.timestamp)}</p>
                            {isResolved && (
                              <span className="inline-flex items-center text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3 mr-0.5" /> Gelöst
                              </span>
                            )}
                            {report.reportedBy?.isAnonymous === false && (
                              <span className="inline-flex items-center text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full" title={report.reportedBy.email || ''}>
                                {report.reportedBy.displayName || report.reportedBy.email || 'Angemeldet'}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-gray-800">{info.label}</p>
                          <p className="text-xs text-gray-600 mt-0.5 break-words line-clamp-2">{report.message}</p>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      </button>
                      {isExpanded && (
                        <div className="p-3 bg-white border-t border-gray-200 space-y-2 text-xs text-gray-700">
                          <p><strong>Kontext:</strong> {report.context}</p>
                          <p>
                            <strong>Gemeldet von:</strong>{' '}
                            {report.reportedBy?.isAnonymous === false
                              ? `${report.reportedBy.displayName || 'Unbekannter Name'}${report.reportedBy.email ? ` (${report.reportedBy.email})` : ''}`
                              : 'Anonym'}
                          </p>
                          <p><strong>Nutzer-Pfad:</strong> <span className="break-all">{report.path}</span></p>
                          <p><strong>App-Version:</strong> {report.appVersion || 'unbekannt'}</p>
                          <p><strong>User-Agent:</strong> <span className="break-all">{report.userAgent || 'unbekannt'}</span></p>
                          {isResolved && (
                            <p className="text-green-700">
                              <strong>Gelöst seit:</strong> {formatTimestamp(resolution.resolvedAt)}
                              {resolution.resolvedInVersion ? ` (V${resolution.resolvedInVersion})` : ''}
                            </p>
                          )}
                          <div className="p-2 bg-red-50 border-l-4 border-red-400 rounded">
                            <p className="font-bold text-red-700 mb-1">Fehlermeldung (ausgeschrieben):</p>
                            <p className="break-words whitespace-pre-wrap">{report.message}</p>
                          </div>
                          {report.stack && (
                            <div className="p-2 bg-gray-100 rounded max-h-40 overflow-y-auto">
                              <p className="font-bold text-gray-600 mb-1">Stacktrace:</p>
                              <pre className="whitespace-pre-wrap break-words text-[10px]">{report.stack}</pre>
                            </div>
                          )}
                          <div className="p-2 bg-blue-50 border-l-4 border-blue-400 rounded">
                            <p className="font-bold text-blue-700 mb-1">Vermutliche Ursache:</p>
                            <p>{info.cause}</p>
                            <p className="font-bold text-blue-700 mt-2 mb-1">Lösungsansatz:</p>
                            <p>{info.fix}</p>
                          </div>
                          <button
                            onClick={() => toggleResolved(report.context, !isResolved)}
                            disabled={togglingContext === report.context}
                            className={`mt-2 w-full flex items-center justify-center px-4 py-2 font-semibold rounded-xl transition text-sm ${
                              isResolved
                                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                          >
                            {togglingContext === report.context ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : isResolved ? (
                              <RotateCcw className="w-4 h-4 mr-2" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                            )}
                            {isResolved ? 'Wieder als offen markieren' : 'Als gelöst markieren (ganzer Kontext)'}
                          </button>
                          <a
                            href={buildMailto(report)}
                            className="mt-2 flex items-center justify-center px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition text-sm"
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Per Mail an Admin senden
                          </a>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
