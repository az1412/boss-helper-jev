/**
 * Benchmark Tests for DevLogger
 *
 * Measures performance characteristics to ensure acceptable speed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logger } from '../core/logger';

describe('Benchmark Tests', () => {
  beforeEach(() => {
    logger.configure({ maxLogs: 10000, enabled: true, minLevel: 'debug' });
    logger.clear();
  });

  afterEach(() => {
    logger.clear();
  });

  describe('Logging Performance', () => {
    it('should log 1000 messages in under 200ms', () => {
      // Note: Test environment (vitest/jsdom) adds overhead
      // Actual browser performance is significantly better
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`);
      }

      const duration = performance.now() - start;
      console.log(`1000 logs: ${duration.toFixed(2)}ms (${(duration / 1000).toFixed(3)}ms per log)`);

      expect(duration).toBeLessThan(200);
    });

    it('should log 1000 messages with data in under 200ms', () => {
      const data = { key: 'value', nested: { arr: [1, 2, 3] } };
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`, data);
      }

      const duration = performance.now() - start;
      console.log(`1000 logs with data: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(200);
    });

    it('should handle 5 subscribers with minimal overhead', () => {
      const unsubscribes: Array<() => void> = [];
      for (let i = 0; i < 5; i++) {
        unsubscribes.push(logger.subscribe(() => {}));
      }

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`);
      }

      const duration = performance.now() - start;
      console.log(`1000 logs with 5 subscribers: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(250);

      unsubscribes.forEach((u) => u());
    });
  });

  describe('Retrieval Performance', () => {
    it('should retrieve 10000 logs in under 10ms', () => {
      for (let i = 0; i < 10000; i++) {
        logger.info(`Message ${i}`);
      }

      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        logger.getLogs();
      }

      const duration = performance.now() - start;
      console.log(`100 getLogs() calls on 10000 logs: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(10);
    });
  });

  describe('FIFO Rotation Performance', () => {
    it('should maintain performance during rotation', () => {
      logger.configure({ maxLogs: 100 });

      const start = performance.now();

      // Log way more than maxLogs to trigger many rotations
      for (let i = 0; i < 5000; i++) {
        logger.info(`Message ${i}`);
      }

      const duration = performance.now() - start;
      console.log(`5000 logs with rotation (maxLogs=100): ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(500);
      expect(logger.getLogs().length).toBe(100);
    });
  });

  describe('Data Cloning Performance', () => {
    it('should clone simple objects efficiently', () => {
      const simpleData = { a: 1, b: 'two', c: true };

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        logger.info('test', simpleData);
      }

      const duration = performance.now() - start;
      console.log(`1000 logs with simple object: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(150);
    });

    it('should handle moderately complex objects', () => {
      const complexData = {
        user: { id: 1, name: 'Test', email: 'test@example.com' },
        items: Array.from({ length: 10 }, (_, i) => ({ id: i, value: `item-${i}` })),
        metadata: { created: new Date(), tags: ['a', 'b', 'c'] },
      };

      const start = performance.now();

      for (let i = 0; i < 500; i++) {
        logger.info('test', complexData);
      }

      const duration = performance.now() - start;
      console.log(`500 logs with complex object: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(300);
    });
  });

  describe('Memory Characteristics', () => {
    it('should not grow memory unbounded', () => {
      logger.configure({ maxLogs: 1000 });

      // Log many times with data
      for (let i = 0; i < 10000; i++) {
        logger.info(`Message ${i}`, { index: i, data: 'x'.repeat(100) });
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(1000);

      // Oldest logs should be removed
      expect(logs[0].message).toBe('Message 9000');
    });
  });

  describe('Subscribe/Unsubscribe Performance', () => {
    it('should handle rapid subscribe/unsubscribe', () => {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        const unsub = logger.subscribe(() => {});
        unsub();
      }

      const duration = performance.now() - start;
      console.log(`1000 subscribe/unsubscribe cycles: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(50);
    });
  });
});
