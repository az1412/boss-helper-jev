# DevLogger - Browser-basierter Dev-Logger mit UI

## Projektziel

Ein leichtgewichtiges NPM-Package, das `console.log` ersetzt und:
- **nur in DEV** aktiv ist
- Logs **strukturiert sammelt**
- sie in einer eigenen **Debug-UI** anzeigt
- **Quelle** (Datei, Zeile) sichtbar macht
- ein **separates Fenster** (Pop-out) erlaubt
- später **Filter, Suche, Gruppen** unterstützt

**Kein Backend. Kein SaaS. Kein Vendor-Lock-in.**

---

## PHASE 0 - Produkt & Scope

### 0.1 Explizite Nicht-Ziele
- [ ] Kein Error-Tracking
- [ ] Kein Performance-Monitoring
- [ ] Keine KI
- [ ] Kein Server
- [ ] Kein Framework-Lock-in

### 0.2 Zielgruppe
- Frontend-Entwickler
- TypeScript / JavaScript
- Moderne Bundler (Vite, Next, Webpack)
- **Kein Legacy-Support** = saubere Architektur

---

## PHASE 1 - Core Logging Konzept

### 1.1 Log-Event Interface

```typescript
interface LogEvent {
  id: string;              // Eindeutige ID
  timestamp: number;       // Unix-Timestamp
  level: LogLevel;         // info | warn | error | debug
  message: string;         // Hauptnachricht
  data?: unknown[];        // Zusatzdaten
  source: {
    file: string;          // Dateiname
    line: number;          // Zeilennummer
    column?: number;       // Spaltennummer
    function?: string;     // Funktionsname
  };
  sessionId: string;       // Pro Browser-Session
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';
```

### 1.2 Lebenszyklus eines Logs

```
1. Log wird erzeugt        → logger.info('message')
2. Log wird angereichert   → Metadaten (Zeit, Herkunft, Session)
3. Log wird gespeichert    → In-Memory Store
4. Log wird verteilt       → Event an Subscriber (UI/Pop-out)
5. Log wird angezeigt      → Overlay/Pop-out rendert
```

### 1.3 DEV/PROD Strategie

```typescript
// Build-Time Elimination via Import
// vite.config.ts / webpack.config.js

// DEV: Volles Logging
import { logger } from 'devlogger';

// PROD: Tree-Shaking entfernt alles
// logger.* Aufrufe werden zu No-Ops
```

**Ziel: Zero Overhead in PROD**

---

## PHASE 2 - Log-Erfassung & Kontext

### 2.1 Herkunftserkennung

```typescript
function captureSource(): Source {
  const stack = new Error().stack;
  // Parse Stack, ignoriere:
  // - Logger-interne Frames
  // - Bundler-Noise (webpack://, vite://)
  // Extrahiere erstes relevantes Frame
}
```

### 2.2 Normalisierung

| Input Type | Normalisierung |
|------------|----------------|
| `string`   | Direkt als message |
| `number`   | String-Konvertierung |
| `object`   | JSON-safe Kopie |
| `array`    | JSON-safe Kopie |
| `Error`    | message + stack extrahieren |
| `undefined`| "[undefined]" |
| `null`     | "[null]" |
| `circular` | "[Circular Reference]" |

### 2.3 Log-Levels

| Level | Farbe | Verwendung |
|-------|-------|------------|
| `debug` | Grau | Detaillierte Entwicklungsinfos |
| `info` | Blau | Allgemeine Informationen |
| `warn` | Orange | Warnungen, nicht-kritisch |
| `error` | Rot | Fehler, kritisch |

---

## PHASE 3 - Interne Log-Pipeline

### 3.1 Zentrale Logger-Instanz

```typescript
class LoggerCore {
  private logs: LogEvent[] = [];
  private subscribers: Set<Subscriber> = new Set();
  private config: LoggerConfig;

  log(level: LogLevel, ...args: unknown[]): void;
  subscribe(fn: Subscriber): Unsubscribe;
  getLogs(): readonly LogEvent[];
  clear(): void;
}

// Singleton Export
export const logger = new LoggerCore();
```

### 3.2 Event-basiertes System

```typescript
type Subscriber = (event: LogEvent) => void;
type Unsubscribe = () => void;

// Ermöglicht:
// - Overlay-UI
// - Pop-out Fenster
// - Mehrere Tabs
// - Spätere Plugins
```

### 3.3 Speicherstrategie

| Aspekt | Wert |
|--------|------|
| Speicherort | In-Memory (Standard) |
| Max Logs | 1000 (konfigurierbar) |
| Rotation | FIFO (älteste zuerst) |
| Persistenz | sessionStorage (optional) |

---

## PHASE 4 - Debug-UI (Overlay)

### 4.1 UI-Philosophie

- **Kein Ersatz** für DevTools
- **Ergänzung** für schnelles Debugging
- **Schnell, ruhig, übersichtlich**
- Fokus: **Lesbarkeit**, nicht Design-Spielerei

### 4.2 Overlay-Verhalten

```
- Standardmäßig verborgen
- Öffnen: Button (fixed) oder Shortcut (Ctrl+Shift+L)
- Position: Rechte Seite, resizable
- Z-Index: 99999 (immer über App)
- Größe: 400px breit (Standard)
```

### 4.3 Log-Darstellung

```
┌─────────────────────────────────────────────┐
│ [INFO]  14:32:05  src/App.tsx:42            │
│ User clicked button                         │
│ ▶ { userId: 123, action: "click" }          │
└─────────────────────────────────────────────┘
```

Jeder Log zeigt:
- Level (farbcodiert)
- Zeit (HH:MM:SS)
- Datei + Zeile
- Nachricht
- Daten (aufklappbar)

---

## PHASE 5 - Pop-out Fenster

### 5.1 Konzept

```
┌──────────────┐     BroadcastChannel     ┌──────────────┐
│   Main App   │ ◄──────────────────────► │   Pop-out    │
│   + Overlay  │                          │   Window     │
└──────────────┘                          └──────────────┘
```

- Separates Browserfenster
- Gleiches UI wie Overlay
- **Synchron** - keine Kopien, Spiegelung

### 5.2 Kommunikation

```typescript
// BroadcastChannel für Tab-übergreifende Kommunikation
const channel = new BroadcastChannel('devlogger');

// Nachrichten:
// - NEW_LOG: Neuer Log-Eintrag
// - CLEAR_LOGS: Logs leeren
// - SYNC_REQUEST: Alle Logs anfordern
// - SYNC_RESPONSE: Alle Logs senden
```

### 5.3 Lebenszyklus

| Ereignis | Verhalten |
|----------|-----------|
| Pop-out öffnen | Sync aller bestehenden Logs |
| Pop-out schließen | Logging läuft weiter |
| Main Tab reload | Pop-out bleibt, reconnect |
| Neue Session | Logs bleiben bis manuell gelöscht |

---

## PHASE 6 - Filter & Suche

### 6.1 Filterdimensionen (Priorität)

1. **Log-Level** - Checkboxes (info, warn, error, debug)
2. **Datei** - Dropdown/Autocomplete
3. **Text** - Freitextsuche in message + data
4. **Zeit** - Range (von/bis)

### 6.2 Architektur

```
Logs (vollständig) → Filter (UI-State) → Angezeigte Logs
```

**Regel:** Logs bleiben vollständig, UI filtert nur die Ansicht.

### 6.3 Filter-State

```typescript
interface FilterState {
  levels: Set<LogLevel>;      // Aktive Levels
  file: string | null;        // Dateifilter
  search: string;             // Suchtext
  timeRange: [number, number] | null;
}
```

---

## PHASE 7 - Entwickler-UX

### 7.1 Öffentliche API

```typescript
// Minimal & stabil
import { logger, DevLoggerUI } from 'devlogger';

// Logging
logger.info('message', data);
logger.warn('message', data);
logger.error('message', data);
logger.debug('message', data);

// UI einbinden (optional)
DevLoggerUI.init();
DevLoggerUI.open();
DevLoggerUI.close();
DevLoggerUI.popout();

// Konfiguration
logger.configure({
  maxLogs: 1000,
  persist: false,
});
```

### 7.2 Dokumentationsstruktur

1. Installation
2. Quick Start
3. DEV/PROD Verhalten
4. UI-Features (Overlay, Pop-out)
5. Filter & Suche
6. Konfiguration
7. API Reference

### 7.3 Erweiterungspunkte (später)

- Custom Log-Types
- Custom Renderer
- Export (JSON, CSV)
- Plugins

---

## PHASE 8 - Qualitätskontrolle

### 8.1 Stress-Tests

| Szenario | Erwartung |
|----------|-----------|
| 10.000 Logs in 1s | UI bleibt responsive |
| Log mit 1MB Objekt | Wird gekürzt/limitiert |
| Infinite Loop Logs | Rotation greift |

### 8.2 Framework-Smoke-Tests

- [ ] React (Vite)
- [ ] Next.js
- [ ] Vue 3
- [ ] Svelte
- [ ] Vanilla JS

---

## Crash-Resistenz (CR)

### CR-1: Strikte Entkopplung

**Erlaubte globale APIs:**
- `Date.now()` - Zeit
- `Error().stack` - Stacktrace
- `sessionStorage` - Persistenz
- `BroadcastChannel` - Messaging
- `window.open()` - Pop-out

**Verboten:**
- App-State lesen
- Framework-Hooks nutzen
- DOM der App manipulieren

### CR-2: Fehlerabfang

```typescript
// Global Error Handler
window.addEventListener('error', (e) => {
  logger.error('Uncaught Error', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  logger.error('Unhandled Rejection', e.reason);
});
```

### CR-3: Zero-Throw-Policy

```typescript
// Jede öffentliche Methode:
log(level: LogLevel, ...args: unknown[]): void {
  try {
    // ... Implementierung
  } catch (e) {
    // Still fail - niemals throw
    console.warn('[DevLogger] Internal error:', e);
  }
}
```

**Fallback-Strategien:**
| Problem | Fallback |
|---------|----------|
| Kein Stacktrace | source: { file: 'unknown', line: 0 } |
| Zirkuläre Referenz | "[Circular]" |
| UI tot | Core Logging läuft weiter |

### CR-4: Zwei-Stufen-Architektur

```
┌─────────────────────────────────────────────┐
│  Core Logger (Stufe 1)                      │
│  - Minimal, stabil, UI-agnostisch           │
│  - Darf NIEMALS crashen                     │
│  - Kennt UI nicht                           │
├─────────────────────────────────────────────┤
│  Renderer/UI (Stufe 2)                      │
│  - Austauschbar, optional                   │
│  - Darf crashen (wird abgefangen)           │
│  - Subscribed auf Core                      │
└─────────────────────────────────────────────┘
```

### CR-5: Persistenz

```typescript
// Speichern VOR UI-Rendering
const log = createLogEvent(...);
storage.save(log);      // Erst speichern
notify(log);            // Dann UI benachrichtigen
```

**Crash-Rehydration:**
- Nach Reload: Logs aus sessionStorage laden
- Session als "crashed" markieren wenn unerwartet beendet

### CR-6: Pop-out als Backup

```
App crasht → Pop-out Window bleibt aktiv
           → Zeigt letzten Stand
           → Kann weiter Logs empfangen (neuer Tab)
```

### CR-7: Crash-Szenarien Matrix

| Error-Typ | App | Debugger | Ergebnis |
|-----------|-----|----------|----------|
| TypeError in App | Crasht | Fängt ab | Log + UI zeigt Error |
| UI Render Error | OK | UI crasht | Core loggt weiter |
| Infinite Loop | Blockiert | Blockiert | Akzeptiert (Browser killt Tab) |
| OOM | Crasht | Crasht | Akzeptiert (unvermeidbar) |
| Network Error | Variabel | OK | Kein Einfluss |

### CR-8: Release-Kriterien

**Release ist NICHT zulässig wenn:**
- [ ] Debugger selbst crashen kann (durch normalen Input)
- [ ] Logs verloren gehen (ohne Rotation/Limit)
- [ ] UI Logging blockiert (sync blocking)

**Chaos-Testing Checklist:**
- [ ] 100x throw new Error() in 1 Sekunde
- [ ] Zirkuläre Objekte loggen
- [ ] undefined/null als jeden Parameter
- [ ] Pop-out während App-Crash
- [ ] Tab reload während Logging

---

## Projekt-Struktur (geplant)

```
devlogger/
├── src/
│   ├── core/
│   │   ├── logger.ts        # LoggerCore Klasse
│   │   ├── types.ts         # Interfaces & Types
│   │   ├── source.ts        # Stacktrace Parsing
│   │   ├── normalize.ts     # Daten-Normalisierung
│   │   └── storage.ts       # Persistenz
│   ├── ui/
│   │   ├── overlay.ts       # Overlay Component
│   │   ├── popout.ts        # Pop-out Handler
│   │   ├── log-entry.ts     # Log-Eintrag Component
│   │   ├── filter.ts        # Filter UI
│   │   └── styles.ts        # CSS-in-JS
│   ├── channel/
│   │   └── broadcast.ts     # BroadcastChannel Wrapper
│   └── index.ts             # Public API
├── package.json
├── tsconfig.json
├── vite.config.ts           # Build Config
└── README.md
```
