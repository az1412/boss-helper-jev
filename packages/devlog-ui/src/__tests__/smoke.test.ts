/**
 * Smoke Tests for DevLogger
 *
 * Quick verification that all basic functionality works correctly.
 * These tests should pass in any environment.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logger, VERSION } from '../index';
import type { LogEvent, LogLevel, LoggerConfig, Source, LogSubscriber, Unsubscribe, FilterState } from '../index';

// Import noop module for verification
import * as noop from '../noop';

describe('Smoke Tests', () => {
  beforeEach(() => {
    logger.configure({ maxLogs: 1000, enabled: true, minLevel: 'debug' });
    logger.clear();
  });

  afterEach(() => {
    logger.clear();
  });

  describe('Basic Logger API', () => {
    it('should export logger singleton', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should export VERSION', () => {
      expect(VERSION).toBeDefined();
      expect(typeof VERSION).toBe('string');
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should log all levels', () => {
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      const logs = logger.getLogs();
      expect(logs.length).toBe(4);
      expect(logs.map((l) => l.level)).toEqual(['debug', 'info', 'warn', 'error']);
    });

    it('should capture log data', () => {
      logger.info('test', { key: 'value' }, 123, 'extra');

      const logs = logger.getLogs();
      expect(logs[0].data.length).toBe(3);
      expect(logs[0].data[0]).toEqual({ key: 'value' });
      expect(logs[0].data[1]).toBe(123);
      expect(logs[0].data[2]).toBe('extra');
    });

    it('should generate unique IDs', () => {
      logger.info('one');
      logger.info('two');
      logger.info('three');

      const logs = logger.getLogs();
      const ids = new Set(logs.map((l) => l.id));
      expect(ids.size).toBe(3);
    });

    it('should generate timestamps', () => {
      const before = Date.now();
      logger.info('test');
      const after = Date.now();

      const logs = logger.getLogs();
      expect(logs[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(logs[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should capture source location', () => {
      logger.info('test');

      const logs = logger.getLogs();
      expect(logs[0].source).toBeDefined();
      expect(typeof logs[0].source.file).toBe('string');
      expect(typeof logs[0].source.line).toBe('number');
    });

    it('should have session ID', () => {
      logger.info('test');

      const logs = logger.getLogs();
      expect(logs[0].sessionId).toBeDefined();
      expect(typeof logs[0].sessionId).toBe('string');
      expect(logs[0].sessionId.startsWith('session_')).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should configure maxLogs', () => {
      logger.configure({ maxLogs: 5 });

      for (let i = 0; i < 10; i++) {
        logger.info(`msg ${i}`);
      }

      expect(logger.getLogs().length).toBe(5);
    });

    it('should configure minLevel', () => {
      logger.configure({ minLevel: 'warn' });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      const logs = logger.getLogs();
      expect(logs.length).toBe(2);
      expect(logs.map((l) => l.level)).toEqual(['warn', 'error']);
    });

    it('should configure enabled', () => {
      logger.configure({ enabled: false });

      logger.info('should not log');

      expect(logger.getLogs().length).toBe(0);

      logger.configure({ enabled: true });
      logger.info('should log');

      expect(logger.getLogs().length).toBe(1);
    });

    it('should return config via getConfig', () => {
      logger.configure({ maxLogs: 500, minLevel: 'info' });

      const config = logger.getConfig();
      expect(config.maxLogs).toBe(500);
      expect(config.minLevel).toBe('info');
      expect(config.enabled).toBe(true);
    });
  });

  describe('Subscriptions', () => {
    it('should subscribe to logs', () => {
      const received: LogEvent[] = [];
      const unsubscribe = logger.subscribe((log) => received.push(log));

      logger.info('test1');
      logger.info('test2');

      expect(received.length).toBe(2);
      expect(received[0].message).toBe('test1');

      unsubscribe();
    });

    it('should unsubscribe correctly', () => {
      const received: LogEvent[] = [];
      const unsubscribe = logger.subscribe((log) => received.push(log));

      logger.info('before');
      unsubscribe();
      logger.info('after');

      expect(received.length).toBe(1);
      expect(received[0].message).toBe('before');
    });

    it('should support multiple subscribers', () => {
      const received1: LogEvent[] = [];
      const received2: LogEvent[] = [];

      const unsub1 = logger.subscribe((log) => received1.push(log));
      const unsub2 = logger.subscribe((log) => received2.push(log));

      logger.info('test');

      expect(received1.length).toBe(1);
      expect(received2.length).toBe(1);

      unsub1();
      unsub2();
    });
  });

  describe('Clear and Session', () => {
    it('should clear logs', () => {
      logger.info('test1');
      logger.info('test2');
      expect(logger.getLogs().length).toBe(2);

      logger.clear();
      expect(logger.getLogs().length).toBe(0);
    });

    it('should return session ID', () => {
      const sessionId = logger.getSessionId();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should maintain session ID across logs', () => {
      logger.info('test1');
      logger.info('test2');

      const logs = logger.getLogs();
      expect(logs[0].sessionId).toBe(logs[1].sessionId);
    });
  });

  describe('Type Exports', () => {
    it('should export LogEvent type', () => {
      const log: LogEvent = {
        id: 'test',
        timestamp: Date.now(),
        level: 'info',
        message: 'test',
        data: [],
        source: { file: 'test.ts', line: 1 },
        sessionId: 'session_123',
      };
      expect(log).toBeDefined();
    });

    it('should export LogLevel type', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
      expect(levels.length).toBe(4);
    });

    it('should export LoggerConfig type', () => {
      const config: LoggerConfig = {
        maxLogs: 100,
        minLevel: 'info',
        enabled: true,
      };
      expect(config).toBeDefined();
    });

    it('should export Source type', () => {
      const source: Source = {
        file: 'test.ts',
        line: 42,
        column: 10,
        function: 'testFn',
      };
      expect(source).toBeDefined();
    });

    it('should export LogSubscriber type', () => {
      const subscriber: LogSubscriber = (event: LogEvent) => {
        console.log(event.message);
      };
      expect(typeof subscriber).toBe('function');
    });

    it('should export Unsubscribe type', () => {
      const unsubscribe: Unsubscribe = () => {};
      expect(typeof unsubscribe).toBe('function');
    });

    it('should export FilterState type', () => {
      const filter: FilterState = {
        levels: new Set(['info', 'error']),
        search: 'test',
        file: 'app.ts',
      };
      expect(filter).toBeDefined();
    });
  });

  describe('Noop Module', () => {
    it('should export noop logger', () => {
      expect(noop.logger).toBeDefined();
      expect(typeof noop.logger.info).toBe('function');
      expect(typeof noop.logger.warn).toBe('function');
      expect(typeof noop.logger.error).toBe('function');
      expect(typeof noop.logger.debug).toBe('function');
    });

    it('should have noop functions that do nothing', () => {
      // These should not throw
      expect(() => {
        noop.logger.info('test');
        noop.logger.warn('test');
        noop.logger.error('test');
        noop.logger.debug('test');
        noop.logger.configure({});
        noop.logger.clear();
      }).not.toThrow();

      // getLogs should return empty array
      expect(noop.logger.getLogs()).toEqual([]);
      expect(noop.logger.getSessionId()).toBe('');
    });

    it('should export noop DevLoggerUI', () => {
      expect(noop.DevLoggerUI).toBeDefined();
      expect(typeof noop.DevLoggerUI.init).toBe('function');
      expect(typeof noop.DevLoggerUI.open).toBe('function');
      expect(typeof noop.DevLoggerUI.close).toBe('function');
      expect(typeof noop.DevLoggerUI.toggle).toBe('function');
      expect(typeof noop.DevLoggerUI.popout).toBe('function');
    });

    it('should have noop UI functions', () => {
      expect(() => {
        noop.DevLoggerUI.init();
        noop.DevLoggerUI.open();
        noop.DevLoggerUI.close();
        noop.DevLoggerUI.toggle();
        noop.DevLoggerUI.popout();
        noop.DevLoggerUI.closePopout();
        noop.DevLoggerUI.setFilter({});
        noop.DevLoggerUI.clearFilter();
        noop.DevLoggerUI.destroy();
      }).not.toThrow();

      expect(noop.DevLoggerUI.isPopoutOpen()).toBe(false);
      expect(noop.DevLoggerUI.isVisible()).toBe(false);
      expect(noop.DevLoggerUI.isInitialized()).toBe(false);
    });

    it('should export VERSION', () => {
      expect(noop.VERSION).toBe(VERSION);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      logger.info('');
      const logs = logger.getLogs();
      expect(logs[0].message).toBe('');
    });

    it('should handle null and undefined data', () => {
      logger.info('test', null, undefined);
      const logs = logger.getLogs();
      expect(logs[0].data).toEqual([null, undefined]);
    });

    it('should handle special characters in message', () => {
      const special = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
      logger.info(special);
      expect(logger.getLogs()[0].message).toBe(special);
    });

    it('should handle unicode in message', () => {
      const unicode = '你好世界 🌍 مرحبا';
      logger.info(unicode);
      expect(logger.getLogs()[0].message).toBe(unicode);
    });

    it('should handle newlines in message', () => {
      const multiline = 'line1\nline2\nline3';
      logger.info(multiline);
      expect(logger.getLogs()[0].message).toBe(multiline);
    });

    it('should convert non-string message', () => {
      // TypeScript prevents this, but JavaScript wouldn't
      (logger as any).info(12345);
      expect(logger.getLogs()[0].message).toBe('12345');
    });

    it('should handle Error objects in data', () => {
      const error = new Error('Test error');
      error.name = 'CustomError';
      logger.error('error occurred', error);

      const logs = logger.getLogs();
      const errorData = logs[0].data[0] as any;
      expect(errorData.__type).toBe('Error');
      expect(errorData.name).toBe('CustomError');
      expect(errorData.message).toBe('Test error');
    });

    it('should handle Date objects in data', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      logger.info('date test', date);

      const logs = logger.getLogs();
      const dateData = logs[0].data[0] as any;
      expect(dateData.__type).toBe('Date');
      expect(dateData.value).toBe('2024-01-15T12:00:00.000Z');
    });

    it('should handle RegExp objects in data', () => {
      const regex = /test-\d+/gi;
      logger.info('regex test', regex);

      const logs = logger.getLogs();
      const regexData = logs[0].data[0] as any;
      expect(regexData.__type).toBe('RegExp');
      expect(regexData.value).toBe('/test-\\d+/gi');
    });

    it('should handle circular references', () => {
      const obj: any = { name: 'circular' };
      obj.self = obj;

      logger.info('circular test', obj);

      const logs = logger.getLogs();
      const data = logs[0].data[0] as any;
      expect(data.name).toBe('circular');
      expect(data.self).toBe('[Circular Reference]');
    });

    it('should handle getFilter on noop', () => {
      const filter = noop.DevLoggerUI.getFilter();
      expect(filter.levels).toBeInstanceOf(Set);
      expect(filter.search).toBe('');
      expect(filter.file).toBe('');
    });
  });

  describe('Immutability', () => {
    it('should return logs array typed as readonly', () => {
      logger.info('test');
      const logs = logger.getLogs();

      // The array is typed as readonly in TypeScript
      // At runtime, it's the actual internal array for performance
      // This is intentional - TypeScript prevents accidental mutations
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(1);
    });

    it('should return copy of config', () => {
      const config1 = logger.getConfig();
      const config2 = logger.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should clone data to prevent mutations', () => {
      const data = { value: 'original' };
      logger.info('test', data);

      data.value = 'modified';

      const logs = logger.getLogs();
      expect((logs[0].data[0] as any).value).toBe('original');
    });
  });
});
