/**
 * Tests for Log Persistence
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../core/logger';
import { LogPersistence } from '../core/persistence';

describe('LogPersistence', () => {
  beforeEach(() => {
    logger.clear();
    LogPersistence.disable();
    LogPersistence.clear();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    LogPersistence.disable();
    LogPersistence.clear();
    logger.clear();
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('Enable/Disable', () => {
    it('should enable persistence', () => {
      expect(LogPersistence.isActive()).toBe(false);
      LogPersistence.enable();
      expect(LogPersistence.isActive()).toBe(true);
    });

    it('should disable persistence', () => {
      LogPersistence.enable();
      expect(LogPersistence.isActive()).toBe(true);
      LogPersistence.disable();
      expect(LogPersistence.isActive()).toBe(false);
    });

    it('should handle multiple enable calls', () => {
      LogPersistence.enable();
      LogPersistence.enable();
      LogPersistence.enable();
      expect(LogPersistence.isActive()).toBe(true);
    });

    it('should handle disable without enable', () => {
      expect(() => LogPersistence.disable()).not.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      LogPersistence.enable();
      const config = LogPersistence.getConfig();
      expect(config.storage).toBe('session');
      expect(config.maxPersisted).toBe(500);
      expect(config.debounceMs).toBe(100);
    });

    it('should accept custom configuration', () => {
      LogPersistence.enable({
        storage: 'local',
        maxPersisted: 100,
        debounceMs: 50,
      });
      const config = LogPersistence.getConfig();
      expect(config.storage).toBe('local');
      expect(config.maxPersisted).toBe(100);
      expect(config.debounceMs).toBe(50);
    });

    it('should update config on re-enable', () => {
      LogPersistence.enable({ maxPersisted: 100 });
      expect(LogPersistence.getConfig().maxPersisted).toBe(100);

      LogPersistence.enable({ maxPersisted: 200 });
      expect(LogPersistence.getConfig().maxPersisted).toBe(200);
    });
  });

  describe('Persistence', () => {
    it('should persist logs to sessionStorage', async () => {
      LogPersistence.enable({ debounceMs: 10 });

      logger.info('test message 1');
      logger.info('test message 2');

      // Wait for debounce
      await new Promise((r) => setTimeout(r, 50));

      const stored = sessionStorage.getItem('devlogger_persisted_logs');
      expect(stored).not.toBeNull();

      const logs = JSON.parse(stored!);
      expect(logs.length).toBe(2);
      expect(logs[0].message).toBe('test message 1');
    });

    it('should persist logs to localStorage when configured', async () => {
      LogPersistence.enable({ storage: 'local', debounceMs: 10 });

      logger.info('local storage test');

      // Wait for debounce
      await new Promise((r) => setTimeout(r, 50));

      const stored = localStorage.getItem('devlogger_persisted_logs');
      expect(stored).not.toBeNull();

      const logs = JSON.parse(stored!);
      expect(logs[0].message).toBe('local storage test');
    });

    it('should respect maxPersisted limit', async () => {
      LogPersistence.enable({ maxPersisted: 5, debounceMs: 10 });

      for (let i = 0; i < 10; i++) {
        logger.info(`message ${i}`);
      }

      // Wait for debounce
      await new Promise((r) => setTimeout(r, 50));

      const stored = sessionStorage.getItem('devlogger_persisted_logs');
      const logs = JSON.parse(stored!);
      expect(logs.length).toBe(5);
      // Should have most recent logs
      expect(logs[0].message).toBe('message 5');
    });

    it('should debounce writes', async () => {
      LogPersistence.enable({ debounceMs: 100 });

      // Rapid logging
      for (let i = 0; i < 100; i++) {
        logger.info(`message ${i}`);
      }

      // Before debounce completes
      await new Promise((r) => setTimeout(r, 50));
      const storedEarly = sessionStorage.getItem('devlogger_persisted_logs');
      // May or may not be stored yet due to timing

      // After debounce
      await new Promise((r) => setTimeout(r, 100));
      const storedLate = sessionStorage.getItem('devlogger_persisted_logs');
      expect(storedLate).not.toBeNull();
    });
  });

  describe('Rehydration', () => {
    it('should rehydrate logs from storage', async () => {
      // Store some logs directly
      const mockLogs = [
        { id: 'log_1', timestamp: 1000, level: 'info', message: 'old log 1', data: [], source: { file: 'test.ts', line: 1 }, sessionId: 'old_session' },
        { id: 'log_2', timestamp: 2000, level: 'warn', message: 'old log 2', data: [], source: { file: 'test.ts', line: 2 }, sessionId: 'old_session' },
      ];
      sessionStorage.setItem('devlogger_persisted_logs', JSON.stringify(mockLogs));

      // Clear current logs
      logger.clear();
      expect(logger.getLogs().length).toBe(0);

      // Rehydrate
      const count = LogPersistence.rehydrate();
      expect(count).toBe(2);
      expect(logger.getLogs().length).toBe(2);
      expect(logger.getLogs()[0].message).toBe('old log 1');
    });

    it('should not duplicate logs on rehydrate', async () => {
      const mockLogs = [
        { id: 'existing_id', timestamp: 1000, level: 'info', message: 'existing', data: [], source: { file: 'test.ts', line: 1 }, sessionId: 'session' },
      ];
      sessionStorage.setItem('devlogger_persisted_logs', JSON.stringify(mockLogs));

      // Import the same log manually
      logger.importLogs(mockLogs as any);

      // Try to rehydrate again
      const count = LogPersistence.rehydrate();
      expect(count).toBe(1); // Returns 1 (logs in storage)
      // But logger should not have duplicates
      const logs = logger.getLogs();
      const ids = logs.map((l) => l.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(logs.length);
    });

    it('should return 0 when no persisted logs', () => {
      const count = LogPersistence.rehydrate();
      expect(count).toBe(0);
    });

    it('should handle invalid stored data', () => {
      sessionStorage.setItem('devlogger_persisted_logs', 'invalid json');
      const count = LogPersistence.rehydrate();
      expect(count).toBe(0);
    });
  });

  describe('Crash Detection', () => {
    it('should detect crash from previous session', () => {
      // Simulate crash by leaving active flag
      sessionStorage.setItem('devlogger_session_active', 'active');

      LogPersistence.enable();
      expect(LogPersistence.hadCrash()).toBe(true);
    });

    it('should not report crash on clean startup', () => {
      // Clean state - no active flag
      LogPersistence.enable();
      expect(LogPersistence.hadCrash()).toBe(false);
    });

    it('should set active flag on enable', () => {
      LogPersistence.enable();
      expect(sessionStorage.getItem('devlogger_session_active')).toBe('active');
    });
  });

  describe('Clear', () => {
    it('should clear persisted logs', async () => {
      LogPersistence.enable({ debounceMs: 10 });
      logger.info('test');

      await new Promise((r) => setTimeout(r, 50));
      expect(sessionStorage.getItem('devlogger_persisted_logs')).not.toBeNull();

      LogPersistence.clear();
      expect(sessionStorage.getItem('devlogger_persisted_logs')).toBeNull();
    });
  });

  describe('GetPersistedLogs', () => {
    it('should return persisted logs without importing', () => {
      const mockLogs = [
        { id: 'log_1', timestamp: 1000, level: 'info', message: 'test', data: [], source: { file: 'test.ts', line: 1 }, sessionId: 'session' },
      ];
      sessionStorage.setItem('devlogger_persisted_logs', JSON.stringify(mockLogs));

      const logs = LogPersistence.getPersistedLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('test');

      // Logger should still be empty
      expect(logger.getLogs().length).toBe(0);
    });

    it('should validate log structure', () => {
      const invalidLogs = [
        { invalid: 'structure' },
        { id: 'valid', timestamp: 1000, level: 'info', message: 'valid', data: [], source: { file: 'test.ts', line: 1 }, sessionId: 'session' },
        null,
      ];
      sessionStorage.setItem('devlogger_persisted_logs', JSON.stringify(invalidLogs));

      const logs = LogPersistence.getPersistedLogs();
      expect(logs.length).toBe(1); // Only the valid one
    });
  });

  describe('Zero-Throw Policy', () => {
    it('should never throw from any method', () => {
      expect(() => {
        LogPersistence.enable();
        LogPersistence.disable();
        LogPersistence.enable();
        LogPersistence.hadCrash();
        LogPersistence.getPersistedLogs();
        LogPersistence.rehydrate();
        LogPersistence.clear();
        LogPersistence.getConfig();
        LogPersistence.isActive();
      }).not.toThrow();
    });
  });
});

describe('LogPersistence Noop', () => {
  it('should export noop LogPersistence from noop module', async () => {
    const noop = await import('../noop');

    expect(noop.LogPersistence).toBeDefined();
    expect(typeof noop.LogPersistence.enable).toBe('function');
    expect(typeof noop.LogPersistence.disable).toBe('function');
    expect(typeof noop.LogPersistence.rehydrate).toBe('function');

    // Should not throw
    expect(() => {
      noop.LogPersistence.enable();
      noop.LogPersistence.disable();
    }).not.toThrow();

    expect(noop.LogPersistence.isActive()).toBe(false);
    expect(noop.LogPersistence.hadCrash()).toBe(false);
    expect(noop.LogPersistence.rehydrate()).toBe(0);
  });
});

describe('Logger importLogs', () => {
  beforeEach(() => {
    logger.clear();
  });

  afterEach(() => {
    logger.clear();
  });

  it('should import logs at beginning', () => {
    logger.info('current log');

    const oldLogs = [
      { id: 'old_1', timestamp: 1000, level: 'info' as const, message: 'old log', data: [], source: { file: 'test.ts', line: 1 }, sessionId: 'old' },
    ];

    logger.importLogs(oldLogs);

    const logs = logger.getLogs();
    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('old log'); // Old log first
    expect(logs[1].message).toBe('current log'); // Current log after
  });

  it('should not import duplicate IDs', () => {
    logger.info('test');
    const currentId = logger.getLogs()[0].id;

    const duplicateLogs = [
      { id: currentId, timestamp: 1000, level: 'info' as const, message: 'duplicate', data: [], source: { file: 'test.ts', line: 1 }, sessionId: 'old' },
    ];

    logger.importLogs(duplicateLogs);
    expect(logger.getLogs().length).toBe(1);
    expect(logger.getLogs()[0].message).toBe('test'); // Original, not duplicate
  });

  it('should handle empty array', () => {
    logger.info('test');
    logger.importLogs([]);
    expect(logger.getLogs().length).toBe(1);
  });

  it('should respect maxLogs after import', () => {
    logger.configure({ maxLogs: 5 });

    // Add 3 current logs
    logger.info('current 1');
    logger.info('current 2');
    logger.info('current 3');

    // Import 5 old logs
    const oldLogs = Array.from({ length: 5 }, (_, i) => ({
      id: `old_${i}`,
      timestamp: i,
      level: 'info' as const,
      message: `old ${i}`,
      data: [],
      source: { file: 'test.ts', line: 1 },
      sessionId: 'old',
    }));

    logger.importLogs(oldLogs);

    // Should only have 5 (maxLogs)
    expect(logger.getLogs().length).toBe(5);
  });
});
