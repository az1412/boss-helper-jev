/**
 * Log Persistence Module
 *
 * Provides early persistence of logs to survive page crashes.
 * Uses sessionStorage for session-scoped persistence.
 *
 * Features:
 * - Immediate persistence after each log (debounced for performance)
 * - Crash rehydration on page load
 * - Storage quota handling
 * - Zero-throw policy maintained
 */

import type { LogEvent, Unsubscribe } from './types';
import { logger } from './logger';

/** Storage key for persisted logs */
const STORAGE_KEY = 'devlogger_persisted_logs';

/** Storage key for crash detection */
const CRASH_FLAG_KEY = 'devlogger_session_active';

/** Configuration for persistence */
export interface PersistenceConfig {
  /** Storage type: 'session' (sessionStorage) or 'local' (localStorage) */
  storage?: 'session' | 'local';
  /** Maximum logs to persist (default: 500) */
  maxPersisted?: number;
  /** Debounce delay in ms for batching writes (default: 100) */
  debounceMs?: number;
}

const DEFAULT_CONFIG: Required<PersistenceConfig> = {
  storage: 'session',
  maxPersisted: 500,
  debounceMs: 100,
};

/** Internal state */
let isEnabled = false;
let config: Required<PersistenceConfig> = { ...DEFAULT_CONFIG };
let pendingLogs: LogEvent[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let wasUncleanShutdown = false;
let unsubscribeFromLogger: Unsubscribe | null = null;

/**
 * Get the appropriate storage object
 */
function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    return config.storage === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Check if there was a crash (unclean shutdown)
 */
function detectCrash(): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;

    // If the flag exists from a previous session, it was an unclean shutdown
    const flag = storage.getItem(CRASH_FLAG_KEY);
    return flag === 'active';
  } catch {
    return false;
  }
}

/**
 * Set the active session flag
 */
function setActiveFlag(): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(CRASH_FLAG_KEY, 'active');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear the active session flag (clean shutdown)
 */
function clearActiveFlag(): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(CRASH_FLAG_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Persist logs to storage
 */
function persistLogs(logs: LogEvent[]): void {
  try {
    const storage = getStorage();
    if (!storage) return;

    // Trim to max persisted
    const toStore = logs.slice(-config.maxPersisted);

    // Serialize and store
    const serialized = JSON.stringify(toStore);
    storage.setItem(STORAGE_KEY, serialized);
  } catch (e) {
    // Handle quota exceeded
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      // Try with fewer logs
      try {
        const storage = getStorage();
        if (!storage) return;
        const reduced = logs.slice(-Math.floor(config.maxPersisted / 2));
        storage.setItem(STORAGE_KEY, JSON.stringify(reduced));
      } catch {
        // Give up silently
      }
    }
  }
}

/**
 * Load persisted logs from storage
 */
function loadPersistedLogs(): LogEvent[] {
  try {
    const storage = getStorage();
    if (!storage) return [];

    const serialized = storage.getItem(STORAGE_KEY);
    if (!serialized) return [];

    const logs = JSON.parse(serialized);
    if (!Array.isArray(logs)) return [];

    // Validate basic structure
    return logs.filter(
      (log): log is LogEvent =>
        log &&
        typeof log.id === 'string' &&
        typeof log.timestamp === 'number' &&
        typeof log.level === 'string' &&
        typeof log.message === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * Clear persisted logs
 */
function clearPersistedLogs(): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Debounced persist function
 */
function schedulePersist(allLogs: LogEvent[]): void {
  // Store reference to latest logs
  pendingLogs = allLogs;

  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Schedule persist
  debounceTimer = setTimeout(() => {
    persistLogs(pendingLogs);
    debounceTimer = null;
  }, config.debounceMs);
}

/**
 * Handle page unload - ensure logs are persisted
 */
function handleBeforeUnload(): void {
  try {
    // Cancel debounce and persist immediately
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (pendingLogs.length > 0) {
      persistLogs(pendingLogs);
    }

    // Clear active flag for clean shutdown
    clearActiveFlag();
  } catch {
    // Ignore errors during unload
  }
}

/**
 * Handle new log event from subscription
 */
function handleNewLog(): void {
  if (!isEnabled) return;
  // Get all current logs from logger and schedule persist
  const allLogs = logger.getLogs();
  schedulePersist([...allLogs]);
}

/**
 * Enable persistence
 */
function enable(options: PersistenceConfig = {}): void {
  if (isEnabled) {
    // Update config
    config = { ...config, ...options };
    return;
  }

  try {
    if (typeof window === 'undefined') {
      return;
    }

    config = { ...DEFAULT_CONFIG, ...options };

    // Check for crash before setting new flag
    wasUncleanShutdown = detectCrash();

    // Set active flag
    setActiveFlag();

    // Subscribe to logger to track new logs
    unsubscribeFromLogger = logger.subscribe(handleNewLog);

    // Register unload handler
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    isEnabled = true;
  } catch {
    // Silent fail
  }
}

/**
 * Disable persistence
 */
function disable(): void {
  if (!isEnabled) return;

  try {
    if (typeof window === 'undefined') {
      return;
    }

    // Cancel pending persist
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Unsubscribe from logger
    if (unsubscribeFromLogger) {
      unsubscribeFromLogger();
      unsubscribeFromLogger = null;
    }

    // Remove handlers
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pagehide', handleBeforeUnload);

    // Clear active flag
    clearActiveFlag();

    isEnabled = false;
  } catch {
    // Silent fail
  }
}

/**
 * Check if last session crashed
 */
function hadCrash(): boolean {
  return wasUncleanShutdown;
}

/**
 * Get persisted logs (for rehydration)
 */
function getPersistedLogs(): LogEvent[] {
  return loadPersistedLogs();
}

/**
 * Rehydrate logs from storage into the logger
 * Returns number of logs rehydrated
 */
function rehydrate(): number {
  try {
    const logs = loadPersistedLogs();
    if (logs.length === 0) {
      return 0;
    }

    // Import logs into the logger
    logger.importLogs(logs);
    return logs.length;
  } catch {
    return 0;
  }
}

/**
 * Clear all persisted data
 */
function clear(): void {
  clearPersistedLogs();
  pendingLogs = [];
  wasUncleanShutdown = false;
}

/**
 * Check if persistence is enabled
 */
function isActive(): boolean {
  return isEnabled;
}

/**
 * Get current configuration
 */
function getConfig(): Readonly<Required<PersistenceConfig>> {
  return { ...config };
}

/**
 * Log Persistence Public API
 */
export const LogPersistence = {
  /**
   * Enable log persistence
   *
   * @example
   * ```typescript
   * LogPersistence.enable();
   *
   * // With options
   * LogPersistence.enable({
   *   storage: 'session',
   *   maxPersisted: 500,
   *   debounceMs: 100
   * });
   * ```
   */
  enable,

  /**
   * Disable log persistence
   */
  disable,

  /**
   * Check if persistence is enabled
   */
  isActive,

  /**
   * Check if the last session had a crash (unclean shutdown)
   */
  hadCrash,

  /**
   * Get persisted logs from previous session (without importing)
   */
  getPersistedLogs,

  /**
   * Rehydrate logs from storage into the logger
   * Call this at app startup to restore logs from previous session
   *
   * @returns Number of logs rehydrated
   *
   * @example
   * ```typescript
   * // At app start
   * LogPersistence.enable();
   * const count = LogPersistence.rehydrate();
   * if (LogPersistence.hadCrash()) {
   *   console.log(`Recovered ${count} logs from crash`);
   * }
   * ```
   */
  rehydrate,

  /**
   * Clear all persisted logs
   */
  clear,

  /**
   * Get current configuration
   */
  getConfig,
};
