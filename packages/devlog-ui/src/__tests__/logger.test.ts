import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger } from '../core/logger';

describe('LoggerCore', () => {
  beforeEach(() => {
    logger.clear();
    logger.configure({ enabled: true, minLevel: 'debug', maxLogs: 1000 });
  });

  describe('Basic Logging', () => {
    it('should log info messages', () => {
      logger.info('test message');
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.level).toBe('info');
      expect(logs[0]?.message).toBe('test message');
    });

    it('should log warn messages', () => {
      logger.warn('warning message');
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.level).toBe('warn');
    });

    it('should log error messages', () => {
      logger.error('error message');
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.level).toBe('error');
    });

    it('should log debug messages', () => {
      logger.debug('debug message');
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.level).toBe('debug');
    });

    it('should include additional data', () => {
      logger.info('message', { foo: 'bar' }, 123);
      const logs = logger.getLogs();
      expect(logs[0]?.data).toEqual([{ foo: 'bar' }, 123]);
    });
  });

  describe('Log Event Structure', () => {
    it('should have all required fields', () => {
      logger.info('test');
      const log = logger.getLogs()[0];

      expect(log).toBeDefined();
      expect(log?.id).toMatch(/^log_\d+_[a-z0-9]+$/);
      expect(log?.timestamp).toBeGreaterThan(0);
      expect(log?.level).toBe('info');
      expect(log?.message).toBe('test');
      expect(log?.data).toEqual([]);
      expect(log?.source).toBeDefined();
      expect(log?.source.file).toBeDefined();
      expect(log?.source.line).toBeDefined();
      expect(log?.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
    });

    it('should have source location', () => {
      logger.info('test');
      const log = logger.getLogs()[0];

      expect(log?.source).toBeDefined();
      expect(typeof log?.source.file).toBe('string');
      expect(typeof log?.source.line).toBe('number');
    });
  });

  describe('Data Normalization', () => {
    it('should handle primitives', () => {
      logger.info('test', 'string', 123, true, null, undefined);
      const log = logger.getLogs()[0];
      expect(log?.data).toEqual(['string', 123, true, null, undefined]);
    });

    it('should handle objects', () => {
      logger.info('test', { nested: { value: 42 } });
      const log = logger.getLogs()[0];
      expect(log?.data).toEqual([{ nested: { value: 42 } }]);
    });

    it('should handle arrays', () => {
      logger.info('test', [1, 2, 3]);
      const log = logger.getLogs()[0];
      expect(log?.data).toEqual([[1, 2, 3]]);
    });

    it('should handle Error objects', () => {
      const error = new Error('test error');
      logger.info('test', error);
      const log = logger.getLogs()[0];
      const errorData = log?.data[0] as { __type: string; name: string; message: string };
      expect(errorData.__type).toBe('Error');
      expect(errorData.name).toBe('Error');
      expect(errorData.message).toBe('test error');
    });

    it('should handle circular references', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      logger.info('test', obj);
      const log = logger.getLogs()[0];
      const data = log?.data[0] as { a: number; self: string };
      expect(data.a).toBe(1);
      expect(data.self).toBe('[Circular Reference]');
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      logger.info('test', date);
      const log = logger.getLogs()[0];
      const dateData = log?.data[0] as { __type: string; value: string };
      expect(dateData.__type).toBe('Date');
      expect(dateData.value).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle RegExp objects', () => {
      logger.info('test', /test/gi);
      const log = logger.getLogs()[0];
      const regexData = log?.data[0] as { __type: string; value: string };
      expect(regexData.__type).toBe('RegExp');
      expect(regexData.value).toBe('/test/gi');
    });
  });

  describe('Configuration', () => {
    it('should respect minLevel setting', () => {
      logger.configure({ minLevel: 'warn' });
      logger.debug('should not appear');
      logger.info('should not appear');
      logger.warn('should appear');
      logger.error('should appear');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0]?.level).toBe('warn');
      expect(logs[1]?.level).toBe('error');
    });

    it('should respect enabled setting', () => {
      logger.configure({ enabled: false });
      logger.info('should not appear');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(0);
    });

    it('should enforce maxLogs limit', () => {
      logger.configure({ maxLogs: 3 });

      logger.info('1');
      logger.info('2');
      logger.info('3');
      logger.info('4');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0]?.message).toBe('2'); // First log was rotated out
      expect(logs[2]?.message).toBe('4');
    });
  });

  describe('Subscription', () => {
    it('should notify subscribers of new logs', () => {
      const subscriber = vi.fn();
      logger.subscribe(subscriber);

      logger.info('test');

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'test',
        })
      );
    });

    it('should allow unsubscribing', () => {
      const subscriber = vi.fn();
      const unsubscribe = logger.subscribe(subscriber);

      logger.info('first');
      unsubscribe();
      logger.info('second');

      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('should handle subscriber errors gracefully', () => {
      const badSubscriber = vi.fn(() => {
        throw new Error('Subscriber error');
      });
      const goodSubscriber = vi.fn();

      logger.subscribe(badSubscriber);
      logger.subscribe(goodSubscriber);

      // Should not throw
      expect(() => logger.info('test')).not.toThrow();

      // Good subscriber should still be called
      expect(goodSubscriber).toHaveBeenCalled();
    });
  });

  describe('Clear', () => {
    it('should clear all logs', () => {
      logger.info('1');
      logger.info('2');
      logger.clear();

      expect(logger.getLogs()).toHaveLength(0);
    });
  });

  describe('Session ID', () => {
    it('should have a session ID', () => {
      const sessionId = logger.getSessionId();
      expect(sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
    });

    it('should use same session ID for all logs', () => {
      logger.info('1');
      logger.info('2');
      const logs = logger.getLogs();
      expect(logs[0]?.sessionId).toBe(logs[1]?.sessionId);
    });
  });

  describe('Zero-Throw Policy', () => {
    it('should not throw on any input', () => {
      // Test various problematic inputs
      expect(() => logger.info(undefined as unknown as string)).not.toThrow();
      expect(() => logger.info(null as unknown as string)).not.toThrow();
      expect(() => logger.info('')).not.toThrow();
      expect(() => logger.info('test', Symbol('sym'))).not.toThrow();
      expect(() => logger.info('test', () => {})).not.toThrow();
    });
  });
});
