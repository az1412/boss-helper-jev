/**
 * Stress Tests for DevLogger
 *
 * Tests high-volume logging, memory behavior, and performance under load.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../core/logger';

describe('Stress Tests', () => {
  beforeEach(() => {
    logger.configure({ maxLogs: 1000, enabled: true, minLevel: 'debug' });
    logger.clear();
  });

  afterEach(() => {
    logger.clear();
  });

  describe('High Volume Logging', () => {
    it('should handle 10,000 logs without throwing', () => {
      expect(() => {
        for (let i = 0; i < 10000; i++) {
          logger.info(`Log message ${i}`, { index: i });
        }
      }).not.toThrow();
    });

    it('should respect maxLogs limit under high volume', () => {
      logger.configure({ maxLogs: 100 });

      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(100);
      // Should have the most recent logs (FIFO)
      expect(logs[0].message).toBe('Message 900');
      expect(logs[99].message).toBe('Message 999');
    });

    it('should handle rapid successive logs', () => {
      const startTime = performance.now();

      for (let i = 0; i < 5000; i++) {
        logger.debug(`Rapid log ${i}`);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete 5000 logs in under 1 second
      expect(duration).toBeLessThan(1000);
    });

    it('should handle mixed log levels under load', () => {
      const levels = ['debug', 'info', 'warn', 'error'] as const;

      for (let i = 0; i < 4000; i++) {
        const level = levels[i % 4];
        logger[level](`${level} message ${i}`);
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(1000); // Default maxLogs
    });
  });

  describe('Data Handling Under Load', () => {
    it('should handle large data objects', () => {
      const largeObject = {
        array: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` })),
        nested: {
          level1: {
            level2: {
              level3: {
                data: 'deeply nested',
              },
            },
          },
        },
      };

      expect(() => {
        for (let i = 0; i < 100; i++) {
          logger.info('Large object', largeObject);
        }
      }).not.toThrow();
    });

    it('should handle circular references in high volume', () => {
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;

      expect(() => {
        for (let i = 0; i < 1000; i++) {
          logger.info('Circular', circular);
        }
      }).not.toThrow();

      const logs = logger.getLogs();
      expect(logs.length).toBe(1000);
    });

    it('should handle Error objects in high volume', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          logger.error('Error occurred', new Error(`Error ${i}`));
        }
      }).not.toThrow();
    });

    it('should handle mixed data types', () => {
      const testData = [
        null,
        undefined,
        42,
        'string',
        true,
        { obj: 'value' },
        [1, 2, 3],
        new Date(),
        /regex/,
        new Error('test'),
        Symbol('sym'),
        BigInt(9007199254740991),
      ];

      expect(() => {
        for (let i = 0; i < 1000; i++) {
          logger.info('Mixed data', testData[i % testData.length]);
        }
      }).not.toThrow();
    });
  });

  describe('Subscriber Performance', () => {
    it('should handle multiple subscribers under load', () => {
      const callCounts = [0, 0, 0, 0, 0];
      const unsubscribes = callCounts.map((_, index) =>
        logger.subscribe(() => {
          callCounts[index]++;
        })
      );

      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`);
      }

      // Each subscriber should have been called 1000 times
      callCounts.forEach((count) => {
        expect(count).toBe(1000);
      });

      // Cleanup
      unsubscribes.forEach((unsub) => unsub());
    });

    it('should handle subscriber that throws', () => {
      const goodCalls: number[] = [];

      logger.subscribe(() => {
        throw new Error('Bad subscriber');
      });

      logger.subscribe((log) => {
        goodCalls.push(log.timestamp);
      });

      // Should not throw despite bad subscriber
      expect(() => {
        for (let i = 0; i < 100; i++) {
          logger.info(`Message ${i}`);
        }
      }).not.toThrow();

      // Good subscriber should still receive all logs
      expect(goodCalls.length).toBe(100);
    });

    it('should handle rapid subscribe/unsubscribe', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          const unsub = logger.subscribe(() => {});
          logger.info(`Message ${i}`);
          unsub();
        }
      }).not.toThrow();
    });
  });

  describe('Configuration Changes Under Load', () => {
    it('should handle config changes while logging', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          if (i % 100 === 0) {
            logger.configure({ maxLogs: 100 + i });
          }
          logger.info(`Message ${i}`);
        }
      }).not.toThrow();
    });

    it('should handle enable/disable toggling', () => {
      let logCount = 0;
      logger.subscribe(() => logCount++);

      for (let i = 0; i < 1000; i++) {
        if (i % 100 === 0) {
          logger.configure({ enabled: i % 200 === 0 });
        }
        logger.info(`Message ${i}`);
      }

      // Only half should be logged (when enabled)
      expect(logCount).toBeLessThan(1000);
      expect(logCount).toBeGreaterThan(0);
    });

    it('should handle minLevel changes', () => {
      const levels: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'warn', 'error'];

      expect(() => {
        for (let i = 0; i < 1000; i++) {
          if (i % 250 === 0) {
            logger.configure({ minLevel: levels[(i / 250) % 4] });
          }
          logger.debug(`Debug ${i}`);
          logger.info(`Info ${i}`);
          logger.warn(`Warn ${i}`);
          logger.error(`Error ${i}`);
        }
      }).not.toThrow();
    });
  });

  describe('Clear Operations', () => {
    it('should handle repeated clear operations', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          for (let j = 0; j < 100; j++) {
            logger.info(`Message ${i}-${j}`);
          }
          logger.clear();
        }
      }).not.toThrow();

      expect(logger.getLogs().length).toBe(0);
    });

    it('should handle clear during active logging', () => {
      let clearCount = 0;

      expect(() => {
        for (let i = 0; i < 1000; i++) {
          logger.info(`Message ${i}`);
          if (i % 100 === 99) {
            logger.clear();
            clearCount++;
          }
        }
      }).not.toThrow();

      expect(clearCount).toBe(10);
    });
  });

  describe('Memory Behavior', () => {
    it('should not grow unbounded with FIFO rotation', () => {
      logger.configure({ maxLogs: 500 });

      // Log way more than maxLogs
      for (let i = 0; i < 10000; i++) {
        logger.info(`Message ${i}`, { data: 'x'.repeat(100) });
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(500);
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(100000);

      expect(() => {
        for (let i = 0; i < 100; i++) {
          logger.info(longMessage);
        }
      }).not.toThrow();
    });

    it('should handle deeply nested objects', () => {
      const createDeepObject = (depth: number): object => {
        if (depth === 0) return { value: 'leaf' };
        return { nested: createDeepObject(depth - 1) };
      };

      expect(() => {
        for (let i = 0; i < 100; i++) {
          logger.info('Deep object', createDeepObject(50));
        }
      }).not.toThrow();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle getLogs while logging', () => {
      let getLogsCount = 0;

      expect(() => {
        for (let i = 0; i < 1000; i++) {
          logger.info(`Message ${i}`);
          if (i % 10 === 0) {
            const logs = logger.getLogs();
            getLogsCount++;
            expect(Array.isArray(logs)).toBe(true);
          }
        }
      }).not.toThrow();

      expect(getLogsCount).toBe(100);
    });

    it('should handle getConfig while logging', () => {
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          logger.info(`Message ${i}`);
          if (i % 100 === 0) {
            const config = logger.getConfig();
            expect(config).toBeDefined();
          }
        }
      }).not.toThrow();
    });
  });
});
