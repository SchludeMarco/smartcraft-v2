import React from 'react';
import { X, ShieldAlert, WifiOff } from 'lucide-react';

// Statische, fest hinterlegte Erste-Hilfe-Checklisten je Beruf — komplett
// ohne KI und ohne jede Verbindung nutzbar (anders als die Analyse-
// Warteschlange in offlineAnalysisQueue.js, die auf die nächste Verbindung
// wartet). Deckt bewusst nur die häufigsten, generischen Problemfälle je
// Gewerk ab; ersetzt keine fotobasierte KI-Diagnose, sondern überbrückt die
// Zeit bis wieder Empfang da ist. Schlüssel müssen zu TRADE_THEMES/
// TRADE_ICONS in App.jsx passen.
export const OFFLINE_QUICK_HELP = {
  Klempner: {
    items: [
      { title: 'Rohrbruch / Wasseraustritt', points: [
        'Haupthahn sofort zudrehen.',
        'Bereich elektrisch spannungsfrei schalten, falls Wasser in Nähe von Steckdosen/Verteilern steht.',
        'Leckstelle eingrenzen (Muffe, Verschraubung, Frostschaden) und Auffangbehälter unterstellen.',
        'Betroffenen Bereich trockenlegen, bevor eine Verkleidung wieder geschlossen wird.',
      ] },
      { title: 'Verstopfter Abfluss', points: [
        'Erst mechanisch (Spirale/Sauglocke) versuchen, dann erst Chemie.',
        'Siphon abschrauben und reinigen (Eimer unterstellen).',
        'Bei Küchenabfluss zuerst auf Fett-/Speisereste prüfen.',
      ] },
      { title: 'Kein Warmwasser', points: [
        'Sicherung und FI-Schutzschalter des Geräts prüfen.',
        'Beim Boiler Thermostat und Reset-Taste prüfen.',
        'Beim Durchlauferhitzer den Mindestdurchfluss (Perlator/Ventil) kontrollieren.',
      ] },
    ],
    safety: 'Bei Gasgeruch: sofort Gashahn zu, Fenster auf, KEINE Schalter betätigen, Bereich verlassen und Notruf/Netzbetreiber rufen.',
  },
  Elektriker: {
    items: [
      { title: 'Sicherung fällt sofort wieder raus', points: [
        'Betroffenen Stromkreis vor jedem erneuten Einschalten freischalten.',
        'Zuletzt angeschlossene Verbraucher abstecken und einzeln testen.',
        'Bei Schmorspuren oder Brandgeruch NICHT wieder einschalten — Fachmann rufen.',
      ] },
      { title: 'FI-Schutzschalter löst aus', points: [
        'Alle Geräte am Kreis trennen, dann einzeln wieder zuschalten, um den Verursacher zu finden.',
        'Feuchtigkeit an Steckdosen/Geräten (z.B. nach Regen, Baustellenstrom) ist die häufigste Ursache.',
      ] },
      { title: 'Stromausfall in einem Teilbereich', points: [
        'Nachbarhaus/Zähler prüfen, um Netzausfall von eigener Anlage zu unterscheiden.',
        'Vor jeder Arbeit an der Anlage: freischalten, gegen Wiedereinschalten sichern, Spannungsfreiheit mit Prüfer feststellen.',
      ] },
    ],
    safety: 'Niemals unter Spannung arbeiten, niemals Sicherungsautomaten überbrücken oder manipulieren.',
  },
  Maler: {
    items: [
      { title: 'Abplatzende/blätternde Farbe', points: [
        'Ursache meist Feuchtigkeit im Untergrund — erst vollständig trocknen lassen.',
        'Lose Farbreste abschleifen/entfernen.',
        'Vor dem Neuanstrich Tiefgrund/Haftgrund auftragen.',
      ] },
      { title: 'Schimmel an der Wand', points: [
        'NICHT einfach überstreichen.',
        'Ursache klären (Feuchte, Wärmebrücke, mangelnde Lüftung).',
        'Fläche mit geeignetem Mittel behandeln, gut trocknen und lüften, erst dann mit Schimmelschutzfarbe streichen.',
      ] },
      { title: 'Risse im Putz vor dem Streichen', points: [
        'Feine Netzrisse mit Tiefgrund kaschieren.',
        'Breitere Risse auskratzen, spachteln, ggf. Armierungsgewebe einsetzen.',
        'Ausreichend trocknen lassen vor dem Anstrich.',
      ] },
    ],
    safety: 'Bei Lösemittelfarben/Lacken in Innenräumen für Durchzug sorgen; bei Altanstrichen (vor 1990) vor dem Schleifen an möglichen Bleigehalt denken (Atemschutz).',
  },
  Gärtner: {
    items: [
      { title: 'Pflanze welkt/verfärbt sich', points: [
        'Erst Gießverhalten prüfen (Fingerprobe im Boden — zu viel oder zu wenig Wasser?).',
        'Standort auf Sonne/Schatten-Eignung prüfen.',
        'Blattunterseiten auf Schädlinge/Pilzbefall kontrollieren.',
      ] },
      { title: 'Braune Flecken im Rasen', points: [
        'Gleichmäßige Flecken → meist Trockenstress.',
        'Runde, scharf abgegrenzte Flecken → möglicher Pilzbefall.',
        'Lässt sich der Rasen wie ein Teppich abrollen? → Schädlinge/Wurzelfraß.',
      ] },
      { title: 'Baum-/Strauchschnitt', points: [
        'Starke Rückschnitte nur außerhalb der gesetzlichen Vogelschutzzeit (in Deutschland 1. März – 30. September eingeschränkt).',
        'Scharfes, desinfiziertes Werkzeug verwenden.',
      ] },
    ],
    safety: 'Bei Arbeiten mit Motorsäge/Freischneider immer vollständige Schutzausrüstung (Schnittschutzhose, Helm mit Visier, Gehörschutz) tragen.',
  },
  Zimmerer: {
    items: [
      { title: 'Feuchte-/Fäulnisschaden am Holzbalken', points: [
        'Feuchtigkeitsquelle zuerst finden und stoppen (Dachundichtigkeit, Kondenswasser).',
        'Mit Klopfprobe/vorsichtigem Stechen prüfen, ob das Holz noch tragfähig ist.',
        'Bei tragenden Bauteilen vor dem Weiterbauen einen Statiker hinzuziehen.',
      ] },
      { title: 'Risse im Balken/Sparren', points: [
        'Längsrisse durch Trocknung sind meist unkritisch.',
        'Querrisse oder Ausbrüche sind statisch relevant — Fachmann hinzuziehen.',
      ] },
      { title: 'Ungeziefer im Holz (Bohrlöcher, Bohrmehl)', points: [
        'Helles, feines Bohrmehl deutet auf aktiven Befall hin (vs. altes, verstaubtes Bohrmehl).',
        'Bei Verdacht auf Hausbock/Holzwurm in tragenden Teilen fachliche Prüfung veranlassen.',
      ] },
    ],
    safety: 'Bei Verdacht auf statisch relevante Schäden nicht selbst weiterbauen — Bereich sichern und Statiker/Bauleiter informieren.',
  },
  Mechaniker: {
    items: [
      { title: 'Motor springt nicht an', points: [
        'Batteriespannung und Polklemmen (sauber/fest) prüfen.',
        'Kraftstoffversorgung kontrollieren.',
        'Fehlercode-Speicher/Warnleuchten beachten.',
      ] },
      { title: 'Ungewöhnliches Geräusch', points: [
        'Art des Geräuschs notieren (Klopfen, Quietschen, Schleifen).',
        'Situation notieren (beim Bremsen, Lenken, Beschleunigen) — hilft der späteren Diagnose enorm.',
      ] },
      { title: 'Warnleuchte an', points: [
        'Symbol im Fahrzeug-Handbuch nachschlagen (meist offline im Fahrzeug vorhanden).',
        'Bei rotem Warnsymbol (Öldruck, Kühlwasser) sofort anhalten und Motor abstellen.',
      ] },
    ],
    safety: 'Bei Arbeiten unter angehobenem Fahrzeug immer zusätzlich Unterstellböcke verwenden — nie nur auf den Wagenheber verlassen.',
  },
  Maurer: {
    items: [
      { title: 'Risse im Mauerwerk', points: [
        'Verlauf und Breite fotografisch dokumentieren, auch ohne Empfang möglich.',
        'Schräge Risse an Ecken (Setzungsrisse) von reinen Putzrissen unterscheiden.',
        'Bei durchgehenden, wachsenden Rissen einen Statiker hinzuziehen.',
      ] },
      { title: 'Feuchte Wand/Mauerwerk', points: [
        'Unten breiter/dunkler → aufsteigende Feuchte.',
        'Nur wetterseitig → Schlagregen.',
        'In Ecken → meist Kondensation/Wärmebrücke.',
      ] },
      { title: 'Mörtel/Verfugung bröckelt', points: [
        'Alte, lose Fugen mindestens auf doppelte Fugentiefe auskratzen.',
        'Fugen reinigen und anfeuchten, dann mit passendem Mörtel neu verfugen.',
      ] },
    ],
    safety: 'Bei Verdacht auf tragende/statische Schäden Bereich absperren und nicht unter belasteten, rissigen Bauteilen aufhalten.',
  },
  Dachdecker: {
    items: [
      { title: 'Wassereintritt/undichte Stelle', points: [
        'Innen mit Eimer/Folie sichern.',
        'Wenn gefahrlos möglich: Notabdichtung außen (Dachfolie/Plane) anbringen.',
        'Genaue Position (Bezug zu Kamin/Fenster/First) für später dokumentieren.',
      ] },
      { title: 'Lose/fehlende Dachziegel', points: [
        'Umliegende Ziegel auf Bruch/Verschiebung prüfen.',
        'Nur ohne Absturzgefahr provisorisch sichern — sonst Bereich absperren und Fachmann/Notdienst rufen.',
      ] },
      { title: 'Verstopfte Dachrinne', points: [
        'Laub/Schmutz von der Mitte in Richtung Fallrohr entfernen.',
        'Gefälle und Befestigung der Rinne mitprüfen.',
      ] },
    ],
    safety: 'Arbeiten auf dem Dach NIE ohne Absturzsicherung und nie bei Nässe, Glätte oder starkem Wind.',
  },
  'Tischler/Schreiner': {
    items: [
      { title: 'Tür/Fenster klemmt', points: [
        'Scharniere auf Verzug/Lockerung prüfen.',
        'Falz auf Farbaufbau/Quellung kontrollieren.',
        'Saisonale Holzbewegung (Feuchtigkeit) ist im Sommer die häufigste Ursache.',
      ] },
      { title: 'Möbel wackelt/hat Spiel', points: [
        'Verbindungen (Dübel, Schrauben, Leim) einzeln prüfen.',
        'Lockere Beschläge nachziehen.',
        'Gebrochene Holzverbindungen neu verleimen statt nur zu verschrauben.',
      ] },
      { title: 'Kratzer/Beschädigung in der Oberfläche', points: [
        'Tiefe des Schadens einschätzen — nur Lack/Lasur oder bis ins Holz?',
        'Entscheidet über Ausbessern vs. komplettes Abschleifen.',
      ] },
    ],
    safety: 'Bei Maschinenarbeit (Kreissäge, Fräse) immer Schutzvorrichtungen nutzen, nie mit Handschuhen an rotierenden Werkzeugen arbeiten.',
  },
  'Allround-Handwerker': {
    items: [
      { title: 'Vor jeder Reparatur', points: [
        'Gefahr für Personen ausschließen (Strom, Wasser, Einsturz).',
        'Betroffenen Bereich sichern bzw. absperren.',
      ] },
      { title: 'Ursache statt Symptom suchen', points: [
        'Wo und wann tritt das Problem auf?',
        'Was hat sich zuletzt verändert (Wetter, neue Geräte, Bauarbeiten in der Nähe)?',
      ] },
      { title: 'Für später dokumentieren', points: [
        'Fotos, Ort, Uhrzeit und Wetter notieren.',
        'Sobald wieder Empfang da ist, liefert die volle KI-Analyse eine fundierte Diagnose dazu.',
      ] },
    ],
    safety: 'Im Zweifel nichts überstürzen: Bereich sichern und auf einen Fachmann bzw. wieder Verbindung warten, statt ein Risiko einzugehen.',
  },
};

// Modal mit der statischen Kurzhilfe für einen Beruf — komplett ohne
// Netzwerkzugriff nutzbar (anders als der Rest der App), da alle Inhalte fix
// im Bundle stehen und per Service Worker gecacht sind (siehe
// vite.config.js). Fällt auf "Allround-Handwerker" zurück, falls der Beruf
// unbekannt ist (sollte durch TRADE_THEMES in App.jsx nicht vorkommen).
const OfflineQuickHelpModal = ({ selectedTrade, theme, onClose }) => {
  const data = OFFLINE_QUICK_HELP[selectedTrade] || OFFLINE_QUICK_HELP['Allround-Handwerker'];
  const accent = theme?.accent || '#6B6355';
  const accentDark = theme?.accentDark || '#554F45';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b pb-3 mb-4 flex-shrink-0">
          <h3 className="text-xl font-bold text-gray-800 flex items-center">
            <WifiOff className="w-5 h-5 mr-2" style={{ color: accent }} />
            Offline-Kurzhilfe: {selectedTrade}
          </h3>
          <button onClick={onClose} aria-label="Schließen" className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Fest hinterlegte Checkliste für die häufigsten Fälle — funktioniert komplett ohne Verbindung.
          Ersetzt keine fotobasierte KI-Diagnose, hilft aber, bis wieder Empfang da ist.
        </p>
        <div className="space-y-4">
          {data.items.map((item) => (
            <div key={item.title} className="rounded-xl p-3" style={{ backgroundColor: theme?.accentSoft || '#EAE7E0' }}>
              <p className="font-bold text-sm mb-1.5" style={{ color: accentDark }}>{item.title}</p>
              <ul className="space-y-1">
                {item.points.map((point, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start">
                    <span className="mr-1.5 mt-0.5" style={{ color: accent }}>•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-red-50 border-l-4 border-red-400 rounded-lg flex items-start space-x-2">
          <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
          <p className="text-xs text-red-700">{data.safety}</p>
        </div>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2.5 rounded-lg text-white text-sm font-semibold hover:opacity-90 flex-shrink-0"
          style={{ backgroundColor: accent }}
        >
          Schließen
        </button>
      </div>
    </div>
  );
};

export default OfflineQuickHelpModal;
