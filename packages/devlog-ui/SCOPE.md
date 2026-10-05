# DevLogger - Scope Definition

> Dieses Dokument ist verbindlich. Jede Feature-Anfrage wird gegen diese Grenzen geprüft.

## Was DevLogger IST

Ein **leichtgewichtiges Browser-Tool** für Entwickler, das:

1. **console.log ersetzt** mit strukturierten Log-Events
2. **Herkunft zeigt** (Datei, Zeile, Funktion)
3. **Debug-UI bietet** (Overlay + Pop-out Fenster)
4. **Nur in DEV läuft** (Zero Overhead in Production)
5. **Filter & Suche** für effizientes Debugging

---

## Explizite NICHT-Ziele

### Kein Error-Tracking
- Keine Sentry-Alternative
- Keine Error-Aggregation
- Keine Crash-Reports an Server
- **Warum:** Andere Tools machen das besser. DevLogger zeigt Logs, tracked keine Fehler.

### Kein Performance-Monitoring
- Keine Metriken-Erfassung
- Keine Timing-Analyse
- Keine Memory-Profiling
- **Warum:** Browser DevTools + spezialisierte Tools existieren.

### Keine KI / ML
- Keine Log-Analyse durch KI
- Keine Anomalie-Erkennung
- Keine "intelligenten" Vorschläge
- **Warum:** Overengineering. Logs lesen reicht.

### Kein Server / Backend
- Keine API-Endpoints
- Keine Datenbank
- Keine Cloud-Speicherung
- Kein Account-System
- **Warum:** DevLogger ist 100% client-side. Punkt.

### Kein Framework-Lock-in
- Keine React-Abhängigkeit
- Keine Vue-Abhängigkeit
- Keine Angular-Abhängigkeit
- Pure TypeScript/JavaScript
- **Warum:** Funktioniert überall oder nirgends.

### Kein Legacy-Support
- Kein IE11
- Kein ES5
- Keine CommonJS-only Umgebungen
- Minimum: ES2020 + moderne Browser
- **Warum:** Saubere Architektur > maximale Kompatibilität.

---

## Zielgruppe

### Primär
- **Frontend-Entwickler** die täglich debuggen
- **TypeScript/JavaScript** Projekte
- **Moderne Bundler** (Vite, Next.js, Webpack 5+)

### Use Cases
1. Schnelles Debugging ohne DevTools öffnen
2. Logs während der Entwicklung sichtbar halten
3. Herkunft von Logs sofort erkennen
4. Pop-out für Multi-Monitor Setups
5. Filtern nach Level/Datei/Text

### Nicht-Zielgruppe
- Backend-Entwickler (Node.js Logging)
- Legacy-Projekte (jQuery, IE11)
- Enterprise Error-Tracking
- Production Monitoring

---

## Erlaubte Erweiterungen (Zukunft)

Diese Features **dürfen** später hinzugefügt werden:

- [ ] Log-Gruppen / Namespaces
- [ ] Export als JSON/CSV
- [ ] Custom Log-Types
- [ ] Themes (Dark/Light)
- [ ] Keyboard Shortcuts anpassbar
- [ ] Plugin-System für Renderer

---

## Verbotene Erweiterungen

Diese Features werden **niemals** hinzugefügt:

- Server-Komponente
- User Authentication
- Remote Logging
- Kostenpflichtige Features
- Telemetrie / Analytics
- Werbung

---

## Entscheidungsregel

Bei Feature-Anfragen:

```
1. Verletzt es ein NICHT-Ziel?        → NEIN
2. Braucht es einen Server?           → NEIN
3. Braucht es Framework-spezifischen Code? → NEIN
4. Erhöht es die Bundle-Size > 5KB?   → Diskussion
5. Alles andere                       → Prüfen
```

---

## Versionierung

- **0.x.x** - MVP, API kann brechen
- **1.0.0** - Stabile API, Production Ready
- **1.x.x** - Neue Features, keine Breaking Changes
- **2.0.0** - Breaking Changes erlaubt

---

*Letzte Aktualisierung: Phase 0*
