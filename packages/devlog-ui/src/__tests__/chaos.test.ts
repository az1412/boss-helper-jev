/**
 * Chaos Tests for DevLogger
 *
 * These tests simulate edge cases, failure scenarios, and hostile inputs
 * to ensure the system remains stable under adverse conditions.
 *
 * CR-8: Chaos-Testing als Release-Kriterium
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../core/logger';
import { ErrorCapture } from '../core/error-capture';
import { LogPersistence } from '../core/persistence';

describe('Chaos Tests', () => {
  beforeEach(() => {
    logger.configure({ maxLogs: 1000, enabled: true, minLevel: 'debug' });
    logger.clear();
    ErrorCapture.uninstall();
    LogPersistence.disable();
    LogPersistence.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    logger.clear();
    ErrorCapture.uninstall();
    LogPersistence.disable();
    LogPersistence.clear();
    sessionStorage.clear();
  });

  describe('Hostile Input', () => {
    it('should handle extremely long messages', () => {
      const longMessage = 'x'.repeat(1_000_000); // 1MB string
      expect(() => logger.info(longMessage)).not.toThrow();
      expect(logger.getLogs()[0].message).toBe(longMessage);
    });

    it('should handle messages with null bytes', () => {
      const nullMessage = 'hello\x00world\x00test';
      expect(() => logger.info(nullMessage)).not.toThrow();
      expect(logger.getLogs()[0].message).toBe(nullMessage);
    });

    it('should handle messages with unicode edge cases', () => {
      const edgeCases = [
        '\uD800', // Lone high surrogate
        '\uDFFF', // Lone low surrogate
        '\uFEFF', // BOM
        '\u0000', // Null
        '\u200B', // Zero-width space
        '🏳️‍🌈', // Complex emoji with ZWJ
        '👨‍👩‍👧‍👦', // Family emoji
        '𝕳𝖊𝖑𝖑𝖔', // Mathematical bold
      ];

      edgeCases.forEach((msg) => {
        expect(() => logger.info(msg)).not.toThrow();
      });
    });

    it('should handle prototype pollution attempts in data', () => {
      const malicious = JSON.parse('{"__proto__": {"polluted": true}}');
      expect(() => logger.info('test', malicious)).not.toThrow();

      // Verify prototype wasn't polluted
      expect(({} as any).polluted).toBeUndefined();
    });

    it('should handle getter/setter properties that throw', () => {
      const hostile = {
        get throwingGetter(): string {
          throw new Error('Getter exploded!');
        },
        normalProp: 'value',
      };

      expect(() => logger.info('test', hostile)).not.toThrow();
    });

    it('should handle objects with toJSON that throws', () => {
      const badToJSON = {
        toJSON() {
          throw new Error('toJSON failed!');
        },
      };

      expect(() => logger.info('test', badToJSON)).not.toThrow();
    });

    it('should handle objects with toString that throws', () => {
      const badToString = {
        toString() {
          throw new Error('toString failed!');
        },
      };

      expect(() => logger.info('test', badToString)).not.toThrow();
    });

    it('should handle Proxy objects', () => {
      const proxy = new Proxy(
        {},
        {
          get() {
            throw new Error('Proxy trap!');
          },
        }
      );

      expect(() => logger.info('test', proxy)).not.toThrow();
    });

    it('should handle Symbol keys in objects', () => {
      const symbolKey = Symbol('secret');
      const obj = { [symbolKey]: 'value', normal: 'data' };

      expect(() => logger.info('test', obj)).not.toThrow();
    });

    it('should handle BigInt values', () => {
      const bigNum = BigInt('9007199254740991');
      expect(() => logger.info('test', bigNum)).not.toThrow();
    });

    it('should handle typed arrays', () => {
      const typedArrays = [
        new Uint8Array([1, 2, 3]),
        new Int32Array([1, 2, 3]),
        new Float64Array([1.1, 2.2, 3.3]),
        new ArrayBuffer(10),
      ];

      typedArrays.forEach((arr) => {
        expect(() => logger.info('test', arr)).not.toThrow();
      });
    });
  });

  describe('Rapid State Changes', () => {
    it('should handle rapid enable/disable of persistence', async () => {
      for (let i = 0; i < 100; i++) {
        LogPersistence.enable();
        logger.info(`log ${i}`);
        LogPersistence.disable();
      }

      expect(logger.getLogs().length).toBe(100);
    });

    it('should handle rapid enable/disable of error capture', () => {
      for (let i = 0; i < 100; i++) {
        ErrorCapture.install();
        ErrorCapture.uninstall();
      }

      expect(ErrorCapture.isActive()).toBe(false);
    });

    it('should handle rapid config changes', () => {
      const levels = ['debug', 'info', 'warn', 'error'] as const;

      for (let i = 0; i < 1000; i++) {
        logger.configure({
          maxLogs: Math.floor(Math.random() * 1000) + 1,
          minLevel: levels[i % 4],
          enabled: i % 2 === 0,
        });
        logger.info(`log ${i}`);
      }

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle rapid subscribe/unsubscribe with logging', () => {
      for (let i = 0; i < 500; i++) {
        const unsub1 = logger.subscribe(() => {});
        const unsub2 = logger.subscribe(() => {});
        logger.info(`log ${i}`);
        unsub1();
        logger.info(`log ${i} after unsub1`);
        unsub2();
      }

      expect(logger.getLogs().length).toBe(1000);
    });

    it('should handle clear during rapid logging', () => {
      for (let i = 0; i < 100; i++) {
        logger.info(`log ${i}`);
        if (i % 10 === 0) {
          logger.clear();
        }
      }

      // Last batch should remain
      expect(logger.getLogs().length).toBeLessThanOrEqual(10);
    });
  });

  describe('Resource Exhaustion Simulation', () => {
    it('should handle maxLogs = 1', () => {
      logger.configure({ maxLogs: 1 });

      for (let i = 0; i < 100; i++) {
        logger.info(`log ${i}`);
      }

      expect(logger.getLogs().length).toBe(1);
      expect(logger.getLogs()[0].message).toBe('log 99');
    });

    it('should handle maxLogs = 0 gracefully', () => {
      logger.configure({ maxLogs: 0 });

      // This might behave differently - logs immediately rotated out
      logger.info('test');
      // Should not crash
      expect(true).toBe(true);
    });

    it('should handle very large maxLogs', () => {
      logger.configure({ maxLogs: 1_000_000 });

      for (let i = 0; i < 100; i++) {
        logger.info(`log ${i}`);
      }

      expect(logger.getLogs().length).toBe(100);
    });

    it('should handle deeply nested data structures', () => {
      const createDeep = (depth: number): object => {
        if (depth === 0) return { value: 'leaf' };
        return { nested: createDeep(depth - 1) };
      };

      // 100 levels deep
      const deep = createDeep(100);
      expect(() => logger.info('deep', deep)).not.toThrow();
    });

    it('should handle arrays with millions of sparse elements', () => {
      const sparse: unknown[] = [];
      sparse[1_000_000] = 'value';

      expect(() => logger.info('sparse', sparse)).not.toThrow();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple subscribers receiving same event', () => {
      const received: number[] = [];

      for (let i = 0; i < 10; i++) {
        logger.subscribe(() => {
          received.push(i);
        });
      }

      logger.info('test');

      expect(received.length).toBe(10);
      expect(new Set(received).size).toBe(10);
    });

    it('should handle subscriber that unsubscribes other subscribers', () => {
      const unsubscribers: Array<() => void> = [];
      const calls: number[] = [];

      for (let i = 0; i < 5; i++) {
        const unsub = logger.subscribe(() => {
          calls.push(i);
          // Try to unsubscribe next one
          if (unsubscribers[i + 1]) {
            unsubscribers[i + 1]();
          }
        });
        unsubscribers.push(unsub);
      }

      logger.info('test');

      // First subscriber should have run
      expect(calls.includes(0)).toBe(true);
    });

    it('should handle subscriber that adds more subscribers', () => {
      let addCount = 0;

      logger.subscribe(() => {
        if (addCount < 5) {
          addCount++;
          logger.subscribe(() => {});
        }
      });

      expect(() => logger.info('test')).not.toThrow();
    });

    it('should handle subscriber that logs more', () => {
      let depth = 0;
      const maxDepth = 10;

      logger.subscribe(() => {
        if (depth < maxDepth) {
          depth++;
          logger.info(`nested ${depth}`);
        }
      });

      logger.info('start');

      // Should have logged start + 10 nested
      expect(logger.getLogs().length).toBe(11);
    });

    it('should handle subscriber that clears logs', () => {
      let cleared = false;

      logger.subscribe(() => {
        if (!cleared) {
          cleared = true;
          logger.clear();
        }
      });

      logger.info('test1');
      logger.info('test2');

      // Behavior depends on implementation, but should not crash
      expect(true).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should continue after subscriber throws', () => {
      logger.subscribe(() => {
        throw new Error('Subscriber 1 failed!');
      });

      logger.subscribe(() => {
        throw new Error('Subscriber 2 failed!');
      });

      const received: string[] = [];
      logger.subscribe((log) => {
        received.push(log.message);
      });

      expect(() => {
        logger.info('test1');
        logger.info('test2');
      }).not.toThrow();

      expect(received).toEqual(['test1', 'test2']);
    });

    it('should handle storage errors gracefully', async () => {
      // Fill up storage
      const original = sessionStorage.setItem.bind(sessionStorage);
      let callCount = 0;

      vi.spyOn(sessionStorage, 'setItem').mockImplementation((key, value) => {
        callCount++;
        if (callCount > 5) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        return original(key, value);
      });

      LogPersistence.enable({ debounceMs: 10 });

      for (let i = 0; i < 100; i++) {
        logger.info(`log ${i}`);
      }

      await new Promise((r) => setTimeout(r, 50));

      // Should not throw, logs should still be in memory
      expect(logger.getLogs().length).toBe(100);

      vi.restoreAllMocks();
    });

    it('should handle corrupted storage data', () => {
      sessionStorage.setItem('devlogger_persisted_logs', 'not valid json {{{');

      expect(() => LogPersistence.rehydrate()).not.toThrow();
      expect(logger.getLogs().length).toBe(0);
    });

    it('should handle storage returning null', () => {
      vi.spyOn(sessionStorage, 'getItem').mockReturnValue(null);

      expect(() => LogPersistence.rehydrate()).not.toThrow();
      expect(LogPersistence.getPersistedLogs()).toEqual([]);

      vi.restoreAllMocks();
    });
  });

  describe('Edge Case Combinations', () => {
    it('should handle all features enabled simultaneously', async () => {
      ErrorCapture.install();
      LogPersistence.enable({ debounceMs: 10 });

      // Log various things
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      // Trigger error capture
      const onerror = window.onerror;
      if (onerror) {
        onerror('Test error', 'test.js', 1, 1, new Error('Test'));
      }

      // Change config while active
      logger.configure({ minLevel: 'warn' });

      // More logs
      logger.debug('filtered');
      logger.warn('shown');

      await new Promise((r) => setTimeout(r, 50));

      // Should have persisted
      const persisted = LogPersistence.getPersistedLogs();
      expect(persisted.length).toBeGreaterThan(0);

      // Cleanup
      ErrorCapture.uninstall();
      LogPersistence.disable();
    });

    it('should handle rapid feature toggling', async () => {
      for (let i = 0; i < 50; i++) {
        ErrorCapture.install();
        LogPersistence.enable();
        logger.info(`log ${i}`);
        LogPersistence.disable();
        ErrorCapture.uninstall();
      }

      expect(logger.getLogs().length).toBe(50);
    });

    it('should handle import during active persistence', async () => {
      LogPersistence.enable({ debounceMs: 10 });

      // Log some
      logger.info('current 1');
      logger.info('current 2');

      // Import old logs while persistence is active
      // Note: importLogs doesn't trigger subscribers, so persistence
      // won't be updated until next log
      const oldLogs = [
        {
          id: 'old_1',
          timestamp: 1000,
          level: 'info' as const,
          message: 'old',
          data: [],
          source: { file: 'test.ts', line: 1 },
          sessionId: 'old',
        },
      ];
      logger.importLogs(oldLogs);

      // Log one more to trigger persistence update with all logs
      logger.info('trigger persist');

      await new Promise((r) => setTimeout(r, 50));

      // Should persist all including imported
      const persisted = LogPersistence.getPersistedLogs();
      expect(persisted.length).toBe(4); // old + current 1 + current 2 + trigger
    });

    it('should survive complete chaos', async () => {
      // Enable everything
      ErrorCapture.install();
      LogPersistence.enable({ debounceMs: 5 });

      // Add chaotic subscribers
      const unsubscribers: Array<() => void> = [];
      for (let i = 0; i < 5; i++) {
        unsubscribers.push(
          logger.subscribe(() => {
            if (Math.random() > 0.5) {
              throw new Error('Random subscriber failure!');
            }
          })
        );
      }

      // Rapid chaotic operations
      const operations = [
        () => logger.debug('debug', { random: Math.random() }),
        () => logger.info('info', new Error('test')),
        () => logger.warn('warn', { circular: {} }),
        () => logger.error('error', null, undefined),
        () => logger.configure({ maxLogs: Math.floor(Math.random() * 100) + 50 }),
        () => logger.clear(),
        () => {
          const unsub = logger.subscribe(() => {});
          unsub();
        },
      ];

      // Run random operations
      for (let i = 0; i < 200; i++) {
        const op = operations[Math.floor(Math.random() * operations.length)];
        expect(() => op()).not.toThrow();
      }

      // Wait for persistence
      await new Promise((r) => setTimeout(r, 50));

      // System should still be functional
      logger.info('sanity check');
      expect(logger.getLogs().some((l) => l.message === 'sanity check')).toBe(true);

      // Cleanup
      unsubscribers.forEach((u) => u());
      ErrorCapture.uninstall();
      LogPersistence.disable();
    });
  });

  describe('Memory Safety', () => {
    it('should not leak memory through subscribers', () => {
      // Create and destroy many subscribers
      for (let i = 0; i < 1000; i++) {
        const unsub = logger.subscribe(() => {});
        unsub();
      }

      // Log to verify no dead references
      logger.info('test');
      expect(logger.getLogs().length).toBe(1);
    });

    it('should not hold references to old data', () => {
      logger.configure({ maxLogs: 10 });

      // Log objects that could be leaked
      for (let i = 0; i < 100; i++) {
        const largeObject = { data: new Array(1000).fill(i) };
        logger.info('test', largeObject);
      }

      // Only 10 should remain
      expect(logger.getLogs().length).toBe(10);
    });
  });
});

describe('Chaos Test Noop Module', () => {
  it('should handle chaos operations on noop', async () => {
    const noop = await import('../noop');

    // None of these should throw
    expect(() => {
      for (let i = 0; i < 100; i++) {
        noop.logger.info('test', { random: Math.random() });
        noop.logger.configure({ maxLogs: i });
        noop.logger.clear();
        noop.ErrorCapture.install();
        noop.ErrorCapture.uninstall();
        noop.LogPersistence.enable();
        noop.LogPersistence.rehydrate();
        noop.LogPersistence.disable();
      }
    }).not.toThrow();

    // All should return safe defaults
    expect(noop.logger.getLogs()).toEqual([]);
    expect(noop.ErrorCapture.isActive()).toBe(false);
    expect(noop.LogPersistence.hadCrash()).toBe(false);
  });
});
