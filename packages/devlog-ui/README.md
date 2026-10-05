# Devlog-UI

A feature-rich, browser-based dev logger with a beautiful debug UI. Zero dependencies, framework-agnostic, production-safe.

## Features

- 📋 **Structured Logging** - Replace `console.log` with type-safe, structured logs
- 🔍 **Source Location** - Automatic file, line, and function tracking
- 🎨 **Debug UI** - Shadow DOM overlay with filter, search, and pop-out window
- 🚀 **Zero Production Overhead** - Tree-shakeable no-op export for production builds
- 🔒 **Crash-Resistant** - Never throws, never breaks your app
- ⚡ **Global Error Capture** - Automatically catch uncaught errors and unhandled rejections
- 💾 **Persistence & Crash Recovery** - Survive page crashes with automatic log persistence
- 🎯 **Spans & Grouping** - Group related logs with timing and nested spans
- 🏷️ **Context & Tags** - Attach requestId, userId, or any context to logs
- 📤 **Export & Share** - Copy logs as JSON or text for bug reports
- 🔄 **Visual Diff** - Compare objects with color-coded change visualization
- 🌐 **Network Capture** - Automatic Fetch/XHR request tracking with spans
- 📊 **Timeline View** - Canvas-based visualization of logs and spans over time
- 🧠 **Resource Monitor** - JS heap usage panel (Chrome-only, graceful fallback)
- 🌐 **Framework-Agnostic** - Works with React, Vue, Svelte, vanilla JS, or any framework

## Installation

```bash
npm install devlog-ui
```

## Demo

https://devlog-ui.okotester.de/

## Quick Start

```typescript
import { logger, DevLoggerUI } from "devlog-ui";

// Initialize the UI (once, at app start)
DevLoggerUI.init();

// Log messages with automatic source tracking
logger.info("App started");
logger.debug("Loading config", { theme: "dark" });
logger.warn("Cache miss", { key: "user_prefs" });
logger.error("API failed", new Error("Network timeout"));
```

## API Reference

### Logger

The `logger` singleton provides four log levels:

```typescript
// Debug - verbose development info
logger.debug(message: string, ...data: unknown[]): void

// Info - general information
logger.info(message: string, ...data: unknown[]): void

// Warning - potential issues
logger.warn(message: string, ...data: unknown[]): void

// Error - errors and exceptions
logger.error(message: string, ...data: unknown[]): void
```

#### Configuration

```typescript
logger.configure({
  maxLogs: 1000, // Max logs in memory (FIFO rotation)
  minLevel: "debug", // Minimum level: 'debug' | 'info' | 'warn' | 'error'
  enabled: true, // Enable/disable logging
  shortcutAction: "toggle", // Ctrl+Shift+L: 'toggle' | 'popout'
  showToggleButton: true, // Show the floating toggle button
  spanCollapsed: false, // Collapse span groups by default
});
```

#### Other Methods

```typescript
// Get all logs (readonly array)
const logs = logger.getLogs();

// Clear all logs
logger.clear();

// Subscribe to new logs
const unsubscribe = logger.subscribe((log: LogEvent) => {
  console.log("New log:", log);
});
unsubscribe(); // Stop receiving logs

// Get current session ID
const sessionId = logger.getSessionId();

// Get current config
const config = logger.getConfig();
```

### Spans (Log Grouping)

Group related logs together with timing and status:

```typescript
// Create a span for an operation
const span = logger.span("Load user profile");
span.info("Fetching from API...");
span.debug("Request payload", { userId: 123 });

// End successfully
span.end(); // status: 'success', duration calculated

// Or end with error
span.fail("Network timeout"); // status: 'error'
span.fail(new Error("Timeout")); // also logs the error
```

#### Nested Spans

```typescript
const requestSpan = logger.span("HTTP Request", { requestId: "abc-123" });

const fetchSpan = requestSpan.span("Fetch Data");
fetchSpan.info("Fetching...");
fetchSpan.end();

const processSpan = requestSpan.span("Process Data");
processSpan.info("Processing...");
processSpan.end();

requestSpan.end(); // Parent span ends after children
```

#### Span Methods

```typescript
// Get all spans
const spans = logger.getSpans();

// Get specific span
const span = logger.getSpan(spanId);

// Get logs belonging to a span
const spanLogs = logger.getSpanLogs(spanId);

// Subscribe to span events
const unsub = logger.subscribeSpans((span) => {
  if (span.status === "error") {
    console.log(`Span ${span.name} failed after ${span.duration}ms`);
  }
});
```

### Context (Tags)

Attach contextual information to logs for filtering and correlation:

```typescript
// Set global context (attached to ALL logs)
logger.setGlobalContext({ env: "development", build: "1.2.3" });

// Update global context
logger.updateGlobalContext({ userId: "user-456" });

// Clear global context
logger.clearGlobalContext();
```

#### Context-Bound Logger

```typescript
// Create a logger with specific context
const reqLogger = logger.withContext({ requestId: "req-123" });
reqLogger.info("Request started"); // includes requestId

// Chain contexts
const userLogger = reqLogger.withContext({ userId: "user-456" });
userLogger.info("User action"); // includes both requestId and userId

// Context loggers can also create spans
const span = reqLogger.span("Process Request");
span.info("Processing..."); // inherits requestId
span.end();
```

### Export

Export logs for sharing, bug reports, or analysis:

```typescript
// Export as JSON (pretty printed)
const json = logger.exportLogs({ format: "json" });

// Export as compact JSON
const compact = logger.exportLogs({ format: "json", pretty: false });

// Export as human-readable text
const text = logger.exportLogs({ format: "text" });

// Filter exports
const filtered = logger.exportLogs({
  format: "json",
  levels: ["warn", "error"], // Only warnings and errors
  lastMs: 30000, // Last 30 seconds
  search: "user", // Contains "user"
});

// Copy to clipboard
const success = await logger.copyLogs({ format: "json" });
if (success) {
  console.log("Logs copied!");
}
```

### Visual Diff

Compare objects and log changes with color-coded visualization:

```typescript
// Log a diff with automatic change detection
const oldConfig = { theme: "light", fontSize: 14 };
const newConfig = { theme: "dark", fontSize: 14, language: "en" };

const diff = logger.diff("Config updated", oldConfig, newConfig);
// Logs with visual diff: +1 added, ~1 changed

console.log(diff.summary);
// { added: 1, removed: 0, changed: 1, unchanged: 1 }

// Specify log level
logger.diff("Breaking change", oldApi, newApi, "warn");

// Compute diff without logging
const result = logger.computeDiff(objA, objB);
if (result.summary.changed > 0) {
  logger.warn("Objects differ!", result.changes);
}
```

#### Diff Utilities

```typescript
import {
  computeDiff,
  createDiffResult,
  hasChanges,
  formatValue,
} from "devlog-ui";

// Low-level diff computation
const changes = computeDiff(oldObj, newObj);
// Returns array of { path, type, oldValue, newValue }

// Full diff result with summary
const result = createDiffResult(oldObj, newObj);
// { changes: [...], summary: { added, removed, changed, unchanged } }

// Quick check for any changes
if (hasChanges(result)) {
  console.log("Objects are different");
}

// Format values for display
formatValue({ a: 1 }); // "{a: 1}"
formatValue([1, 2, 3, 4, 5]); // "[5 items]"
```

### Network Capture

Automatically track Fetch and XHR requests with spans:

```typescript
import { NetworkCapture } from "devlog-ui";

// Install at app start
NetworkCapture.install();

// All fetch calls are now automatically logged
await fetch("/api/users"); // Creates a span with timing

// With configuration
NetworkCapture.install({
  captureFetch: true, // Hook into fetch (default: true)
  captureXHR: true, // Hook into XHR (default: true)
  includeHeaders: true, // Log request headers (default: false)
  includeBody: true, // Log request body (default: false)
  includeResponse: true, // Log response body (default: false)
  maxResponseLength: 5000, // Max response chars to capture
  ignorePatterns: [
    // URLs to ignore
    "/analytics",
    /\.hot-update\./,
    /sockjs/,
  ],
  context: { service: "api" }, // Context for all network logs
});

// Add ignore patterns dynamically
NetworkCapture.addIgnorePattern("/health");

// Check status
NetworkCapture.isActive();
NetworkCapture.getConfig();

// Uninstall and restore original fetch/XHR
NetworkCapture.uninstall();
```

Network requests create spans automatically:

```
[info] GET /api/users
  └─ span: "GET /api/users" (234ms, success)
     ├─ status: 200
     ├─ response: { users: [...] }
     └─ headers: { content-type: "application/json" }
```

### Timeline

Visualize logs and spans on a canvas-based timeline:

```typescript
import { createTimeline, Timeline } from "devlog-ui";

// Create timeline in a container
const timeline = createTimeline({
  container: "#timeline-container", // CSS selector or HTMLElement
  timeWindow: 60000, // Show last 60 seconds
  refreshInterval: 100, // Refresh rate in ms
  showSpans: true, // Display span bars
  showLogs: true, // Display log markers
  height: 200, // Canvas height in pixels
});

// Update time window
timeline.setTimeWindow(30000); // Show last 30 seconds

// Cleanup when done
timeline.destroy();
```

Timeline features:

- Color-coded log markers (debug/info/warn/error)
- Span bars with duration and nesting
- Hover tooltips with details
- Auto-scroll to follow new logs
- Time axis with tick marks

### DevLoggerUI

The UI overlay provides a visual interface for viewing logs:

```typescript
// Initialize (creates Shadow DOM host)
DevLoggerUI.init();

// Show/hide panel
DevLoggerUI.open();
DevLoggerUI.close();
DevLoggerUI.toggle();

// Open in separate window
DevLoggerUI.popout();
DevLoggerUI.closePopout();
DevLoggerUI.isPopoutOpen();

// Filter logs programmatically
DevLoggerUI.setFilter({
  levels: new Set(["warn", "error"]), // Show only warnings and errors
  search: "api", // Text search
  file: "utils", // Filter by file name
});
DevLoggerUI.getFilter();
DevLoggerUI.clearFilter();

// Cleanup
DevLoggerUI.destroy();

// State checks
DevLoggerUI.isVisible();
DevLoggerUI.isInitialized();
```

The overlay and pop-out also include a Resource Monitor panel that shows JS heap usage
(Chrome-only; other browsers show an "unsupported" notice).

### Keyboard Shortcut

Press `Ctrl+Shift+L` to toggle the debug panel.

### ErrorCapture

Automatically capture uncaught errors and unhandled promise rejections:

```typescript
import { ErrorCapture } from "devlog-ui";

// Install at app start
ErrorCapture.install();

// With custom configuration
ErrorCapture.install({
  captureErrors: true, // Capture window.onerror (default: true)
  captureRejections: true, // Capture unhandledrejection (default: true)
  errorPrefix: "[ERROR]", // Prefix for error messages
  rejectionPrefix: "[REJECT]", // Prefix for rejection messages
});

// Check if active
ErrorCapture.isActive();

// Get current config
ErrorCapture.getConfig();

// Uninstall and restore original handlers
ErrorCapture.uninstall();
```

All captured errors are automatically logged as `error` level with full stack traces.

### LogPersistence

Persist logs to survive page crashes and enable crash recovery:

```typescript
import { LogPersistence, logger } from "devlog-ui";

// Enable persistence at app start
LogPersistence.enable();

// Rehydrate logs from previous session
const count = LogPersistence.rehydrate();
if (LogPersistence.hadCrash()) {
  logger.warn(`Recovered ${count} logs from previous crash`);
}

// With custom configuration
LogPersistence.enable({
  storage: "session", // 'session' (sessionStorage) or 'local' (localStorage)
  maxPersisted: 500, // Max logs to persist
  debounceMs: 100, // Debounce writes for performance
});

// Check if active
LogPersistence.isActive();

// Get persisted logs without importing
const logs = LogPersistence.getPersistedLogs();

// Clear persisted logs
LogPersistence.clear();

// Disable persistence
LogPersistence.disable();
```

Logs are persisted automatically after each new log (debounced). On page unload, logs are saved synchronously to ensure no data loss.

## Production Build

For production, import from `devlog-ui/noop` to completely eliminate logging code via tree-shaking:

### Vite

```typescript
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      devlog-ui:
        process.env.NODE_ENV === "production" ? "devlog-ui/noop" : "devlog-ui",
    },
  },
});
```

### Webpack

```javascript
// webpack.config.js
module.exports = {
  resolve: {
    alias: {
      devlog-ui:
        process.env.NODE_ENV === "production" ? "devlog-ui/noop" : "devlog-ui",
    },
  },
};
```

### esbuild

```javascript
// build.js
require("esbuild").build({
  alias: {
    devlog-ui:
      process.env.NODE_ENV === "production" ? "devlog-ui/noop" : "devlog-ui",
  },
});
```

The `noop` export provides the same API but all functions are no-ops, resulting in zero runtime overhead after tree-shaking.

## Types

```typescript
import type {
  LogEvent,
  LogLevel,
  LoggerConfig,
  Source,
  FilterState,
  ErrorCaptureConfig,
  LogContext,
  SpanEvent,
  SpanStatus,
  ExportOptions,
  DiffEntry,
  DiffResult,
  DiffChangeType,
  NetworkCaptureConfig,
  TimelineConfig,
} from "devlog-ui";

type LogLevel = "debug" | "info" | "warn" | "error";
type SpanStatus = "running" | "success" | "error";
type LogContext = Record<string, string | number | boolean>;

interface Source {
  file: string;
  line: number;
  column?: number;
  function?: string;
}

interface LogEvent {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  data: unknown[];
  source: Source;
  sessionId: string;
  context?: LogContext; // Attached context/tags
  spanId?: string; // Parent span ID
}

interface SpanEvent {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: SpanStatus;
  parentId?: string; // For nested spans
  context?: LogContext;
  source: Source;
  sessionId: string;
}

interface LoggerConfig {
  maxLogs?: number;
  minLevel?: LogLevel;
  enabled?: boolean;
  shortcutAction?: "toggle" | "popout";
  showToggleButton?: boolean;
  spanCollapsed?: boolean;
}

interface ExportOptions {
  format?: "json" | "text";
  lastMs?: number; // Filter by time
  levels?: LogLevel[]; // Filter by levels
  search?: string; // Filter by text
  pretty?: boolean; // Pretty print JSON
}

interface FilterState {
  levels: Set<LogLevel>;
  search: string;
  file: string;
}

interface ErrorCaptureConfig {
  captureErrors?: boolean;
  captureRejections?: boolean;
  errorPrefix?: string;
  rejectionPrefix?: string;
}

interface PersistenceConfig {
  storage?: "session" | "local";
  maxPersisted?: number;
  debounceMs?: number;
}

// Diff types
type DiffChangeType = "added" | "removed" | "changed" | "unchanged";

interface DiffEntry {
  path: string; // e.g., "user.profile.name"
  type: DiffChangeType;
  oldValue?: unknown;
  newValue?: unknown;
}

interface DiffResult {
  changes: DiffEntry[];
  summary: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
}

interface NetworkCaptureConfig {
  captureFetch?: boolean;
  captureXHR?: boolean;
  includeHeaders?: boolean;
  includeBody?: boolean;
  includeResponse?: boolean;
  maxResponseLength?: number;
  ignorePatterns?: (string | RegExp)[];
  context?: LogContext;
}

interface TimelineConfig {
  container: HTMLElement | string;
  timeWindow?: number;
  refreshInterval?: number;
  showSpans?: boolean;
  showLogs?: boolean;
  height?: number;
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Application                        │
│                                                              │
│   logger.info('message', data)  ───────────────────────┐    │
│                                                         │    │
└─────────────────────────────────────────────────────────│────┘
                                                          │
┌─────────────────────────────────────────────────────────▼────┐
│                     LoggerCore (Singleton)                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Capture  │──│ Enrich   │──│  Store   │──│  Notify  │    │
│  │ Source   │  │ Metadata │  │ (FIFO)   │  │ Subs     │    │
│  └──────────┘  └──────────┘  └──────────┘  └────┬─────┘    │
│                                                  │          │
└──────────────────────────────────────────────────│──────────┘
                                                   │
          ┌────────────────────────────────────────┤
          │                                        │
          ▼                                        ▼
┌─────────────────────┐              ┌─────────────────────────┐
│   DevLoggerUI       │◄────────────►│   Pop-out Window        │
│   (Shadow DOM)      │  Broadcast   │   (Separate Window)     │
│                     │   Channel    │                         │
│  ┌───────────────┐  │              │  ┌───────────────────┐  │
│  │ Filter Bar    │  │              │  │ Synced Logs       │  │
│  │ Log List      │  │              │  │ Clear Button      │  │
│  │ Toggle Button │  │              │  │ Connection Status │  │
│  └───────────────┘  │              │  └───────────────────┘  │
└─────────────────────┘              └─────────────────────────┘
```

## Design Principles

1. **Zero-Throw Policy** - The logger never throws exceptions. If something goes wrong internally, it fails silently to avoid breaking your app.

2. **UI-Agnostic Core** - The `LoggerCore` has no knowledge of the UI. It only manages logs and notifies subscribers.

3. **Shadow DOM Isolation** - The UI uses Shadow DOM to prevent CSS conflicts with your application.

4. **Strict Decoupling** - The logger and UI are completely independent. You can use the logger without the UI, or create your own UI using the `subscribe()` API.

5. **No Side Effects on Import** - Importing the logger doesn't create any DOM elements or start any listeners. You must explicitly call `DevLoggerUI.init()`.

## Browser Support

- Chrome/Edge 80+
- Firefox 78+
- Safari 14+

Requires support for:

- Shadow DOM
- BroadcastChannel
- ES2020+

## License

MIT
