# Crash-Szenarien Matrix

Dieses Dokument beschreibt mögliche Crash-Szenarien und wie DevLogger damit umgeht.

## Übersicht

| Szenario | Schwere | Mitigation | Status |
|----------|---------|------------|--------|
| Browser-Crash/Tab-Kill | Kritisch | LogPersistence | ✅ |
| JavaScript Runtime Error | Hoch | Zero-Throw-Policy | ✅ |
| Storage Quota überschritten | Mittel | Graceful Degradation | ✅ |
| Unhandled Promise Rejection | Mittel | ErrorCapture | ✅ |
| Pop-out Window geschlossen | Niedrig | BroadcastChannel Reconnect | ✅ |
| Circular Reference in Data | Niedrig | SafeClone | ✅ |
| Memory Pressure | Mittel | FIFO Rotation | ✅ |
| sessionStorage nicht verfügbar | Niedrig | Fallback | ✅ |

---

## Detaillierte Szenarien

### 1. Browser-Crash / Tab-Kill

**Beschreibung:** Der Browser stürzt ab oder der Tab wird vom Benutzer oder System beendet.

**Auswirkung:** Alle In-Memory Logs gehen verloren.

**Mitigation:**
- `LogPersistence` speichert Logs automatisch in sessionStorage/localStorage
- `beforeunload` und `pagehide` Events triggern synchronen Save
- Bei Neustart: `LogPersistence.rehydrate()` stellt Logs wieder her
- `LogPersistence.hadCrash()` erkennt unclean Shutdown

**Code-Beispiel:**
```typescript
LogPersistence.enable();

// Bei App-Start
const count = LogPersistence.rehydrate();
if (LogPersistence.hadCrash()) {
  logger.warn(`App recovered from crash. Restored ${count} logs.`);
}
```

---

### 2. JavaScript Runtime Error im Logger

**Beschreibung:** Ein unerwarteter Fehler tritt innerhalb des Loggers auf.

**Auswirkung:** Ohne Schutz könnte die Host-Applikation crashen.

**Mitigation:**
- **Zero-Throw-Policy:** Alle Logger-Methoden sind in try-catch gewrappt
- Fehler werden still geschluckt oder an console.warn weitergeleitet
- Die Host-Applikation wird nie durch Logger-Fehler unterbrochen

**Betroffene Methoden:**
- `logger.info/warn/error/debug()` - silent fail
- `logger.configure()` - silent fail
- `logger.subscribe()` - returns noop unsubscribe on error
- `LogPersistence.*` - silent fail
- `ErrorCapture.*` - silent fail

---

### 3. Storage Quota überschritten

**Beschreibung:** sessionStorage/localStorage hat keine Kapazität mehr.

**Auswirkung:** Logs können nicht persistiert werden.

**Mitigation:**
- Erster Versuch: Normal speichern
- Bei QuotaExceededError: Reduzierte Anzahl speichern (50%)
- Bei erneutem Fehler: Silent fail, nur In-Memory
- `maxPersisted` Config begrenzt gespeicherte Logs

**Code:**
```typescript
// In persistence.ts
try {
  storage.setItem(STORAGE_KEY, serialized);
} catch (e) {
  if (e.name === 'QuotaExceededError') {
    // Try with fewer logs
    const reduced = logs.slice(-maxPersisted / 2);
    storage.setItem(STORAGE_KEY, JSON.stringify(reduced));
  }
}
```

---

### 4. Unhandled Promise Rejection

**Beschreibung:** Ein Promise wird rejected ohne catch-Handler.

**Auswirkung:** Fehler könnte unbemerkt bleiben.

**Mitigation:**
- `ErrorCapture.install()` registriert `unhandledrejection` Listener
- Rejection wird automatisch als Error geloggt
- Stack-Trace und Reason werden erfasst

---

### 5. Pop-out Window unerwartet geschlossen

**Beschreibung:** User schließt Pop-out Window während Main-App läuft.

**Auswirkung:** Logs erscheinen nicht mehr im Pop-out.

**Mitigation:**
- BroadcastChannel bleibt aktiv in Main-App
- Pop-out kann jederzeit neu geöffnet werden
- `SYNC_REQUEST` holt alle existierenden Logs
- Connection-Status Indikator im UI

---

### 6. Circular Reference in Log-Daten

**Beschreibung:** User loggt Objekt mit zirkulärer Referenz.

**Auswirkung:** `JSON.stringify()` würde crashen.

**Mitigation:**
- `safeClone()` verwendet WeakSet für Cycle-Detection
- Zirkuläre Referenzen werden zu `"[Circular Reference]"` konvertiert
- Logging funktioniert weiterhin

**Beispiel:**
```typescript
const obj = { name: 'test' };
obj.self = obj; // Circular!

logger.info('circular', obj);
// Logged as: { name: 'test', self: '[Circular Reference]' }
```

---

### 7. Memory Pressure / Hohe Log-Last

**Beschreibung:** Viele Logs in kurzer Zeit führen zu Memory-Problemen.

**Auswirkung:** Browser könnte langsam werden oder crashen.

**Mitigation:**
- FIFO Rotation mit konfigurierbarem `maxLogs` (default: 1000)
- Älteste Logs werden automatisch entfernt
- Debounced Persistence reduziert Write-Last
- Shadow DOM isoliert UI-Updates

---

### 8. sessionStorage nicht verfügbar

**Beschreibung:** Private Browsing oder Security-Settings blockieren Storage.

**Auswirkung:** Persistence funktioniert nicht.

**Mitigation:**
- `getStorage()` gibt `null` zurück bei Fehler
- Alle Storage-Operationen prüfen auf `null`
- Logger funktioniert weiterhin (nur ohne Persistence)
- Session-ID wird ephemeral generiert

---

### 9. BroadcastChannel nicht unterstützt

**Beschreibung:** Alter Browser ohne BroadcastChannel Support.

**Auswirkung:** Pop-out Sync funktioniert nicht.

**Mitigation:**
- Feature-Detection vor Nutzung
- Pop-out funktioniert standalone (ohne Sync)
- Main-UI bleibt voll funktional

---

### 10. Shadow DOM nicht unterstützt

**Beschreibung:** Sehr alter Browser ohne Shadow DOM.

**Auswirkung:** UI Styles könnten leaken oder konfligieren.

**Mitigation:**
- Browser ohne Shadow DOM Support sind nicht unterstützt
- Logger-Core funktioniert weiterhin (ohne UI)
- Klare Browser-Requirements dokumentiert

---

## Test-Matrix

| Szenario | Unit Test | Integration Test | Manual Test |
|----------|-----------|------------------|-------------|
| Browser-Crash | ✅ Mock | - | ✅ |
| JS Error in Logger | ✅ | ✅ | - |
| Storage Quota | ✅ Mock | - | ✅ |
| Promise Rejection | ✅ | ✅ | - |
| Pop-out Close | - | - | ✅ |
| Circular Ref | ✅ | ✅ | - |
| Memory Pressure | ✅ Stress | ✅ Benchmark | - |
| Storage unavailable | ✅ Mock | - | ✅ |

---

## Recovery-Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                      App Start                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              LogPersistence.enable()                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Check for crash flag (session_active)             │  │
│  │ 2. Set wasUncleanShutdown if flag exists             │  │
│  │ 3. Set new session_active flag                       │  │
│  │ 4. Subscribe to logger for auto-persist              │  │
│  │ 5. Register beforeunload handler                     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              LogPersistence.rehydrate()                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Load logs from storage                            │  │
│  │ 2. Validate log structure                            │  │
│  │ 3. Import into logger (deduplicated)                 │  │
│  │ 4. Return count of restored logs                     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              LogPersistence.hadCrash()                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Returns true if last session didn't exit cleanly     │  │
│  │ → Show recovery message to user                      │  │
│  │ → Log warning about crash                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Normal Operation                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • Logs persisted on each new log (debounced)         │  │
│  │ • beforeunload saves synchronously                   │  │
│  │ • session_active cleared on clean exit               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Empfohlene Initialisierung

```typescript
import {
  logger,
  DevLoggerUI,
  ErrorCapture,
  LogPersistence
} from 'devlogger';

// 1. Enable persistence first
LogPersistence.enable();

// 2. Rehydrate previous logs
const restored = LogPersistence.rehydrate();

// 3. Check for crash
if (LogPersistence.hadCrash()) {
  logger.warn(`Recovered from crash. Restored ${restored} logs.`);
}

// 4. Enable global error capture
ErrorCapture.install();

// 5. Initialize UI
DevLoggerUI.init();

// Ready!
logger.info('App initialized', { restored, hadCrash: LogPersistence.hadCrash() });
```
