import React from 'react';
import { X, ScrollText } from 'lucide-react';

// Impressum + Datenschutzerklärung als Modal, aufrufbar über den Footer-Link
// in App.jsx (kein Router im Projekt, daher kein eigener /impressum-Pfad).
// Inhalt spiegelt die tatsächliche Datenverarbeitung im Code wider (siehe
// Verweise unten) - bei neuen Datenverarbeitungen (neuer API-Endpoint, neuer
// Drittanbieter, neue Firestore-Collection) muss dieser Text mitgepflegt
// werden, sonst wird er unbemerkt unvollständig/falsch, genau wie
// README.md (siehe CLAUDE.md).
const VERANTWORTLICHER = {
  name: 'Marco Schlude',
  strasse: 'Leopoldstraße 3',
  ort: '72469 Meßstetten',
  land: 'Deutschland',
  email: 'marco.schlude@gmail.com',
};

const Section = ({ title, children }) => (
  <section className="mb-5">
    <h4 className="text-sm font-bold text-gray-800 mb-1.5">{title}</h4>
    <div className="text-xs text-gray-600 space-y-2 leading-relaxed">{children}</div>
  </section>
);

const LegalPanel = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b pb-3 mb-4 flex-shrink-0">
          <h3 className="text-xl font-bold text-gray-800 flex items-center">
            <ScrollText className="w-5 h-5 mr-2 text-gray-600" />
            Impressum &amp; Datenschutz
          </h3>
          <button onClick={onClose} aria-label="Schließen" className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-y-auto flex-grow pr-1">
          <div className="mb-3 p-2.5 bg-amber-50 border-l-4 border-amber-400 rounded text-[11px] text-amber-800">
            Dieser Text wurde als Entwurf auf Basis der tatsächlich im Code
            verwendeten Dienste erstellt und ist keine Rechtsberatung. Vor
            produktivem Einsatz mit einem größeren Nutzerkreis empfiehlt sich
            eine Prüfung durch eine fachkundige Stelle.
          </div>

          <Section title="Impressum">
            <p>Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz):</p>
            <p>
              {VERANTWORTLICHER.name}
              <br />
              {VERANTWORTLICHER.strasse}
              <br />
              {VERANTWORTLICHER.ort}, {VERANTWORTLICHER.land}
            </p>
            <p>
              E-Mail:{' '}
              <a href={`mailto:${VERANTWORTLICHER.email}`} className="text-blue-600 hover:underline">
                {VERANTWORTLICHER.email}
              </a>
            </p>
            <p>
              Sm@rtCraft ist ein privates, nicht-kommerzielles
              Studien-/Portfolioprojekt ohne Gewinnerzielungsabsicht.
            </p>
            <p>
              Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:{' '}
              {VERANTWORTLICHER.name} (Anschrift wie oben).
            </p>
          </Section>

          <Section title="1. Verantwortlicher im Sinne der DSGVO">
            <p>
              {VERANTWORTLICHER.name}, {VERANTWORTLICHER.strasse},{' '}
              {VERANTWORTLICHER.ort}, {VERANTWORTLICHER.land} —{' '}
              <a href={`mailto:${VERANTWORTLICHER.email}`} className="text-blue-600 hover:underline">
                {VERANTWORTLICHER.email}
              </a>
            </p>
          </Section>

          <Section title="2. Hosting">
            <p>
              Diese App wird bei Vercel Inc. (USA) gehostet. Vercel verarbeitet
              beim Aufruf der App automatisch technische Zugriffsdaten (u.a.
              IP-Adresse, aufgerufene Datei, Zeitpunkt, verwendeter Browser)
              zur Auslieferung und Absicherung des Dienstes. Rechtsgrundlage:
              berechtigtes Interesse an einem sicheren, funktionsfähigen
              Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Es kann zu einer
              Datenübermittlung in die USA kommen; Vercel verweist hierfür auf
              EU-Standardvertragsklauseln.
            </p>
          </Section>

          <Section title="3. Anmeldung (Firebase Authentication)">
            <p>
              Die Nutzung der App erfordert eine Anmeldung mit einem
              Google-Konto (Firebase Authentication); dabei werden Name,
              E-Mail-Adresse und Profilbild aus dem Google-Konto verarbeitet,
              um die eigene Analyse-Historie dem Konto zuordnen zu können,
              Premium-Sprachausgabe zu ermöglichen und Fehlerreports einer
              echten Person zuordnen zu können. Anbieter: Google Ireland
              Limited. Rechtsgrundlage: Vertragserfüllung/vorvertragliche
              Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO) für die Kernfunktion.
            </p>
          </Section>

          <Section title="4. Analyse-Historie (Cloud Firestore)">
            <p>
              Durchgeführte Analysen (gewählter Beruf, Problembeschreibung,
              KI-Antwort, Zeitpunkt) werden in der Datenbank Cloud Firestore
              (Google) ausschließlich unter der eigenen, dem Gerät/Konto
              zugeordneten Kennung gespeichert und sind technisch nur für
              dieses Gerät/Konto einsehbar. Ein optional hochgeladenes Foto
              wird dabei bewusst <em>nicht</em> mitgespeichert (zu groß für
              Firestore) — es bleibt nur für die laufende Sitzung im Browser
              vorhanden. Ist die optionale Standort-Erkennung aktiviert (siehe
              Punkt 17), wird zusätzlich der GPS-Standort der Analyse
              gespeichert. Zweck: Verlaufsfunktion innerhalb der App.
              Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
            </p>
          </Section>

          <Section title="5. KI-gestützte Problemanalyse (Google Gemini API)">
            <p>
              Die eingegebene Problembeschreibung, der ausgewählte Beruf sowie
              ein optional hochgeladenes oder mit der Kamera aufgenommenes Foto
              der Problemstelle werden zur Erzeugung der Analyse an die Google
              Gemini API übermittelt und dort verarbeitet (Google Ireland
              Limited / Google LLC, USA). Das Foto wird ausschließlich für
              diese Anfrage übertragen und nicht serverseitig bei SmartCraft
              gespeichert (siehe Punkt 4). Enthält ein Foto erkennbare
              Personen oder andere Dritte (z. B. im Hintergrund), werden auch
              deren Daten mit übertragen — es empfiehlt sich, Fotos möglichst
              auf die eigentliche Problemstelle zu beschränken.
              Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO),
              da die Analyse die Kernfunktion der App ist. Ein
              Haftungsausschluss zur KI-generierten Antwort wird in der App
              selbst angezeigt.
            </p>
          </Section>

          <Section title="6. Sprachausgabe (Text-to-Speech)">
            <p>
              Standardmäßig wird die im Browser eingebaute Web Speech API
              verwendet — die Sprachausgabe läuft dabei lokal im Gerät, ohne
              Datenübertragung an SmartCraft- oder Google-Server. Zusätzlich
              kann eine "Premium"-Sprachausgabe über die Google Cloud
              Text-to-Speech API genutzt werden; dabei wird der vorzulesende
              Text an Google übermittelt. Rechtsgrundlage:
              Einwilligung durch aktive Auswahl der Premium-Option (Art. 6
              Abs. 1 lit. a DSGVO).
            </p>
          </Section>

          <Section title="7. Fehlerreports">
            <p>
              Tritt ein technischer Fehler auf, wird automatisch ein Bericht
              (Fehlerkontext, Fehlermeldung, gekürzter Stacktrace,
              App-Version, User-Agent, Zeitpunkt) in Cloud Firestore
              gespeichert und zusätzlich per E-Mail über den Dienst Resend
              (USA) an den Verantwortlichen gesendet, damit Fehler zeitnah
              behoben werden können. Der Bericht wird zusätzlich mit
              Name/E-Mail des meldenden Google-Kontos versehen.
              Rechtsgrundlage: berechtigtes Interesse an einem
              funktionsfähigen, fehlerfreien Betrieb (Art. 6 Abs. 1 lit. f
              DSGVO).
            </p>
          </Section>

          <Section title="8. Feedback">
            <p>
              Über den Feedback-Button kann freiwillig eine Nachricht an den
              Verantwortlichen geschickt werden. Sie wird per E-Mail über den
              Dienst Resend (USA) zugestellt, nicht dauerhaft in Cloud
              Firestore gespeichert. Die Nachricht wird zusätzlich mit
              Name/E-Mail des Google-Kontos versehen, damit bei Rückfragen
              geantwortet werden kann. Rechtsgrundlage:
              Einwilligung durch aktives Senden (Art. 6 Abs. 1 lit. a DSGVO).
            </p>
          </Section>

          <Section title="9. App-Start-Statistik">
            <p>
              Bei jedem App-Start wird ein Eintrag mit Zeitpunkt und grober
              Region (Land/Stadt, ermittelt serverseitig über
              Standort-Header des Hosting-Anbieters — keine exakten
              GPS-Koordinaten, kein Zugriff auf Geräte-Standortdienste)
              gespeichert. Ist man angemeldet, wird zusätzlich die eigene,
              unter Punkt 3 genannte Konto-Kennung mitgespeichert, um
              wiederkehrende Geräte von unterschiedlichen Geräten am selben Ort
              unterscheiden zu können, ohne dass dafür Name oder E-Mail nötig
              sind. Aufrufe über das eigene,
              administrative Konto werden hiervon ausgenommen. Zweck: Betrieb
              und Weiterentwicklung der App sinnvoll einschätzen zu können
              (z. B. Nutzungsumfang, grobe geografische Verteilung).
              Rechtsgrundlage: berechtigtes Interesse (Art. 6 Abs. 1 lit. f
              DSGVO). Speicherdauer: aktuell zeitlich nicht automatisch
              begrenzt; eine automatische Löschung nach einer festen Frist ist
              vorgesehen.
            </p>
          </Section>

          <Section title="10. Missbrauchs- und Kontingentschutz">
            <p>
              Um Missbrauch der KI-Funktionen und Massenanfragen zu verhindern,
              wird zu einzelnen Anfragen vorübergehend ein Zähler zur
              IP-Adresse in Cloud Firestore geführt (z. B. Anfragen pro
              Minute/Tag, Feedback- und Fehlerreport-Versand sowie —
              ausschließlich für Anfragen ohne gültige Anmeldung — ein
              Gesamtkontingent). Für angemeldete Konten wird zusätzlich unter
              der eigenen Konto-Kennung gezählt, wie viele der 20 kostenlosen
              Haupt-Diagnosen bereits genutzt wurden (siehe Punkt 16). Die
              IP-Adresse selbst wird dabei nur für diesen Zweck verarbeitet,
              nicht mit den übrigen unter Punkt 4–9 genannten Daten verknüpft.
              Rechtsgrundlage: berechtigtes Interesse an der Abwehr von
              Missbrauch (Art. 6 Abs. 1 lit. f DSGVO).
            </p>
          </Section>

          <Section title="11. Bot-/Missbrauchserkennung (Firebase App Check / reCAPTCHA)">
            <p>
              Zum Schutz der Server-Schnittstellen vor automatisiertem
              Missbrauch wird Google reCAPTCHA v3 (Firebase App Check)
              eingesetzt. Dabei werden u. a. IP-Adresse und
              Interaktionsverhalten an Google übermittelt und analysiert.
              Rechtsgrundlage: berechtigtes Interesse an der Absicherung der
              App (Art. 6 Abs. 1 lit. f DSGVO). Weitere Informationen: Google
              Datenschutzerklärung und reCAPTCHA-Nutzungsbedingungen.
            </p>
          </Section>

          <Section title="12. Lokal gespeicherte Daten (Local Storage)">
            <p>
              Der Browser speichert lokal auf dem eigenen Gerät u. a. die
              Anmeldesitzung (Firebase Authentication) sowie noch nicht
              erfolgreich übertragene Fehlerreports (bis zu 30 Einträge), damit
              diese auch nach kurzzeitigem Offline-Zustand nicht verloren
              gehen. Diese Daten verlassen das Gerät erst bei erfolgreicher
              Übertragung bzw. bleiben rein lokal.
            </p>
          </Section>

          <Section title="13. Empfänger / Auftragsverarbeiter">
            <p>
              Google Ireland Limited / Google LLC (Firebase Authentication,
              Cloud Firestore, Gemini API, Cloud Text-to-Speech, reCAPTCHA),
              Vercel Inc. (Hosting), Resend (E-Mail-Versand von
              Fehlerberichten und Feedback). Mit diesen Anbietern bestehen
              bzw. gelten deren jeweilige Auftragsverarbeitungs- und
              Standardvertragsklausel-Regelungen.
            </p>
          </Section>

          <Section title="14. Rechte der betroffenen Personen">
            <p>
              Es besteht das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung
              (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der
              Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20
              DSGVO) sowie Widerspruch gegen auf berechtigtem Interesse
              beruhende Verarbeitungen (Art. 21 DSGVO). Erteilte
              Einwilligungen können jederzeit mit Wirkung für die Zukunft
              widerrufen werden. Zudem besteht ein Beschwerderecht bei einer
              Datenschutzaufsichtsbehörde, z. B. dem Landesbeauftragten für
              den Datenschutz und die Informationsfreiheit
              Baden-Württemberg.
            </p>
            <p>
              Anfragen hierzu bitte per E-Mail an{' '}
              <a href={`mailto:${VERANTWORTLICHER.email}`} className="text-blue-600 hover:underline">
                {VERANTWORTLICHER.email}
              </a>.
            </p>
          </Section>

          <Section title="15. Automatisierte Entscheidungsfindung">
            <p>
              Die KI-Analyse ist ein rein unterstützendes Hilfsmittel und
              stellt keine automatisierte Entscheidung mit rechtlicher Wirkung
              im Sinne von Art. 22 DSGVO dar.
            </p>
          </Section>

          <Section title="16. Eigener Gemini-API-Key (optional)">
            <p>
              Jedes Konto erhält ein kostenloses Kontingent von 20 Haupt-
              Diagnosen. Danach kann im Profil freiwillig ein selbst bei
              Google AI Studio erstellter, eigener Gemini-API-Key hinterlegt
              werden, damit die App weiter genutzt werden kann — die dadurch
              entstehenden Kosten laufen dann direkt über das eigene
              Google-Konto der nutzenden Person, nicht über SmartCraft. Der
              Key wird in Cloud Firestore ausschließlich unter der eigenen
              Konto-Kennung gespeichert und ausschließlich serverseitig
              gelesen, um die eigenen KI-Anfragen dieses Kontos an die
              Gemini API weiterzuleiten — er wird nicht an Dritte
              weitergegeben und nicht für andere Konten verwendet. Der Key
              kann im Profil jederzeit entfernt werden. Rechtsgrundlage:
              Einwilligung durch aktives Hinterlegen (Art. 6 Abs. 1 lit. a
              DSGVO).
            </p>
          </Section>

          <Section title="17. Standort-Erkennung (optional, GPS)">
            <p>
              Im Profil kann freiwillig eine Standort-Erkennung aktiviert
              werden. Ist sie eingeschaltet, fragt die App bei einer neuen
              Analyse über die Geolocation-Funktion des Browsers den exakten
              GPS-Standort des Geräts ab und speichert ihn zusammen mit der
              Analyse in Cloud Firestore (siehe Punkt 4) — ausschließlich
              unter der eigenen Konto-Kennung. Damit lassen sich frühere
              Analysen an derselben Stelle wiederfinden: Beim Öffnen der App
              wird der aktuelle Standort mit den zuletzt gespeicherten
              Standorten desselben Kontos verglichen (Umkreis von ca. 75
              Metern); bei einer Übereinstimmung erscheint ein Hinweis
              ("Sie waren hier schon X Mal") mit direktem Zugriff auf diese
              Analysen. Dieser Abgleich erfolgt ausschließlich innerhalb des
              eigenen Kontos, nicht kontoübergreifend. Ohne aktivierte
              Standort-Erkennung wird kein Standort abgefragt oder
              gespeichert; die Einstellung kann im Profil jederzeit wieder
              deaktiviert werden. Rechtsgrundlage: Einwilligung durch aktive
              Aktivierung (Art. 6 Abs. 1 lit. a DSGVO).
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
};

export default LegalPanel;
