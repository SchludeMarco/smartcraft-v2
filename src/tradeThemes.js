// Berufs-Farbpalette (Akzent-, Hover- und heller "Soft"-Ton je Beruf) —
// ausgelagert aus App.jsx, damit auch andere Module (z.B. OfflineQueueModal)
// sie importieren können, ohne einen zirkulären Import auf App.jsx zu
// erzeugen. Die App übernimmt diese Palette global, sobald ein Beruf gewählt
// ist (siehe `theme` in der App-Komponente). Die Farben sind bewusst
// berufsspezifisch/thematisch gewählt (z.B. Wasser-Blau beim Klempner, Grün
// beim Gärtner, Ziegelrot beim Maurer) statt größtenteils gleicher Blautöne,
// damit die Berufsauswahl (TradeButton) und Verlaufs-Badges auf einen Blick
// unterscheidbar sind.
export const TRADE_THEMES = {
  "Klempner": { accent: "#1E7A8C", accentDark: "#175F6E", accentSoft: "#DCEEF1" },
  "Elektriker": { accent: "#96690A", accentDark: "#7A5408", accentSoft: "#EFE4C8" },
  "Maler": { accent: "#7D4F92", accentDark: "#643E76", accentSoft: "#EDE2F1" },
  "Gärtner": { accent: "#3F7D45", accentDark: "#326336", accentSoft: "#E0EDE1" },
  "Zimmerer": { accent: "#A15C32", accentDark: "#804A28", accentSoft: "#F0E0D2" },
  "Mechaniker": { accent: "#5C5C5C", accentDark: "#454545", accentSoft: "#E6E6E6" },
  "Maurer": { accent: "#A3432F", accentDark: "#813526", accentSoft: "#F0DBD5" },
  "Dachdecker": { accent: "#2E4A5E", accentDark: "#253A4A", accentSoft: "#DCE4EA" },
  "Tischler/Schreiner": { accent: "#6B4F3B", accentDark: "#563F2F", accentSoft: "#EFE8E1" },
  "Allround-Handwerker": { accent: "#6B6355", accentDark: "#554F45", accentSoft: "#EAE7E0" },
};
export const DEFAULT_TRADE = "Allround-Handwerker";
