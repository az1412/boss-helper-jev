/**
 * Tests for Spans, Context, and Export features
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger } from '../core/logger';

describe('Spans', () => {
  beforeEach(() => {
    logger.clear();
    logger.configure({ enabled: true, minLevel: 'debug' });
    logger.clearGlobalContext();
  });

  describe('Basic Span Operations', () => {
    it('should create a span with name', () => {
      const span = logger.span('Test Span');
      expect(span.id).toBeTruthy();
      expect(span.event.name).toBe('Test Span');
      expect(span.event.status).toBe('running');
      expect(span.ended).toBe(false);
    });

    it('should end a span successfully', () => {
      const span = logger.span('Test Span');
      span.end();
      expect(span.ended).toBe(true);
      expect(span.event.status).toBe('success');
      expect(span.event.duration).toBeGreaterThanOrEqual(0);
    });

    it('should fail a span with error status', () => {
      const span = logger.span('Test Span');
      span.fail();
      expect(span.ended).toBe(true);
      expect(span.event.status).toBe('error');
    });

    it('should fail a span with error message', () => {
      const span = logger.span('Test Span');
      span.fail('Something went wrong');
      expect(span.event.status).toBe('error');
      const logs = logger.getLogs();
      expect(logs.some((l) => l.message === 'Something went wrong')).toBe(true);
    });

    it('should calculate duration correctly', async () => {
      const span = logger.span('Timed Span');
      await new Promise((r) => setTimeout(r, 50));
      span.end();
      expect(span.event.duration).toBeGreaterThanOrEqual(40);
    });
  });

  describe('Span Logging', () => {
    it('should log within a span', () => {
      const span = logger.span('Test Span');
      span.info('Info message');
      span.debug('Debug message');
      span.warn('Warn message');
      span.error('Error message');
      span.end();

      const logs = logger.getLogs();
      expect(logs.length).toBe(4);
      logs.forEach((log) => {
        expect(log.spanId).toBe(span.id);
      });
    });

    it('should not log after span ends', () => {
      const span = logger.span('Test Span');
      span.end();
      span.info('Should not appear');
      expect(logger.getLogs().length).toBe(0);
    });

    it('should get logs for a specific span', () => {
      const span1 = logger.span('Span 1');
      span1.info('Span 1 log');
      span1.end();

      const span2 = logger.span('Span 2');
      span2.info('Span 2 log');
      span2.end();

      logger.info('Unspanned log');

      const span1Logs = logger.getSpanLogs(span1.id);
      expect(span1Logs.length).toBe(1);
      expect(span1Logs[0].message).toBe('Span 1 log');
    });
  });

  describe('Nested Spans', () => {
    it('should create child spans', () => {
      const parent = logger.span('Parent');
      const child = parent.span('Child');

      expect(child.event.parentId).toBe(parent.id);
      parent.end();
      child.end();
    });

    it('should inherit context in child spans', () => {
      const parent = logger.span('Parent', { requestId: '123' });
      const child = parent.span('Child', { userId: '456' });

      child.info('Test');
      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({ requestId: '123', userId: '456' });
    });
  });

  describe('Span Retrieval', () => {
    it('should get all spans', () => {
      const span1 = logger.span('Span 1');
      const span2 = logger.span('Span 2');
      span1.end();
      span2.end();

      const spans = logger.getSpans();
      expect(spans.length).toBe(2);
    });

    it('should get a specific span by ID', () => {
      const span = logger.span('Test Span');
      span.end();

      const retrieved = logger.getSpan(span.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Span');
    });

    it('should return undefined for unknown span ID', () => {
      expect(logger.getSpan('unknown-id')).toBeUndefined();
    });
  });

  describe('Span Subscribers', () => {
    it('should notify on span start', () => {
      const subscriber = vi.fn();
      const unsub = logger.subscribeSpans(subscriber);

      const span = logger.span('Test');
      expect(subscriber).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test', status: 'running' })
      );

      unsub();
      span.end();
    });

    it('should notify on span end', () => {
      const subscriber = vi.fn();
      const unsub = logger.subscribeSpans(subscriber);

      const span = logger.span('Test');
      span.end();

      expect(subscriber).toHaveBeenCalledTimes(2);
      expect(subscriber).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'success', duration: expect.any(Number) })
      );

      unsub();
    });
  });
});

describe('Context', () => {
  beforeEach(() => {
    logger.clear();
    logger.configure({ enabled: true, minLevel: 'debug' });
    logger.clearGlobalContext();
  });

  describe('Global Context', () => {
    it('should set global context', () => {
      logger.setGlobalContext({ env: 'test', build: 123 });
      expect(logger.getGlobalContext()).toEqual({ env: 'test', build: 123 });
    });

    it('should update global context', () => {
      logger.setGlobalContext({ env: 'test' });
      logger.updateGlobalContext({ build: 123 });
      expect(logger.getGlobalContext()).toEqual({ env: 'test', build: 123 });
    });

    it('should clear global context', () => {
      logger.setGlobalContext({ env: 'test' });
      logger.clearGlobalContext();
      expect(logger.getGlobalContext()).toEqual({});
    });

    it('should attach global context to logs', () => {
      logger.setGlobalContext({ env: 'test' });
      logger.info('Test message');
      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({ env: 'test' });
    });
  });

  describe('Context Logger', () => {
    it('should create a context-bound logger', () => {
      const ctxLogger = logger.withContext({ requestId: 'req-123' });
      ctxLogger.info('Request started');

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({ requestId: 'req-123' });
    });

    it('should merge global and local context', () => {
      logger.setGlobalContext({ env: 'test' });
      const ctxLogger = logger.withContext({ requestId: 'req-123' });
      ctxLogger.info('Test');

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({ env: 'test', requestId: 'req-123' });
    });

    it('should support all log levels', () => {
      const ctxLogger = logger.withContext({ test: true });
      ctxLogger.debug('debug');
      ctxLogger.info('info');
      ctxLogger.warn('warn');
      ctxLogger.error('error');

      const logs = logger.getLogs();
      expect(logs.length).toBe(4);
      logs.forEach((log) => {
        expect(log.context).toEqual({ test: true });
      });
    });

    it('should create spans with context', () => {
      const ctxLogger = logger.withContext({ requestId: 'req-123' });
      const span = ctxLogger.span('Request');
      span.info('Processing');
      span.end();

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({ requestId: 'req-123' });
    });

    it('should chain contexts', () => {
      const ctxLogger1 = logger.withContext({ requestId: 'req-123' });
      const ctxLogger2 = ctxLogger1.withContext({ userId: 'user-456' });
      ctxLogger2.info('Test');

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({ requestId: 'req-123', userId: 'user-456' });
    });
  });
});

describe('Export', () => {
  beforeEach(() => {
    logger.clear();
    logger.configure({ enabled: true, minLevel: 'debug' });
    logger.clearGlobalContext();
  });

  describe('JSON Export', () => {
    it('should export logs as JSON', () => {
      logger.info('Test 1');
      logger.warn('Test 2');

      const exported = logger.exportLogs({ format: 'json' });
      const parsed = JSON.parse(exported);
      expect(parsed.length).toBe(2);
      expect(parsed[0].message).toBe('Test 1');
    });

    it('should export pretty JSON by default', () => {
      logger.info('Test');
      const exported = logger.exportLogs({ format: 'json' });
      expect(exported).toContain('\n');
    });

    it('should export compact JSON when pretty=false', () => {
      logger.info('Test');
      const exported = logger.exportLogs({ format: 'json', pretty: false });
      expect(exported).not.toContain('\n');
    });
  });

  describe('Text Export', () => {
    it('should export logs as text', () => {
      logger.info('Test message');
      const exported = logger.exportLogs({ format: 'text' });
      expect(exported).toContain('INFO');
      expect(exported).toContain('Test message');
    });

    it('should include context in text export', () => {
      logger.setGlobalContext({ env: 'test' });
      logger.info('Test');
      const exported = logger.exportLogs({ format: 'text' });
      expect(exported).toContain('env=test');
    });

    it('should include span info in text export', () => {
      const span = logger.span('TestSpan');
      span.info('Span log');
      span.end();

      const exported = logger.exportLogs({ format: 'text' });
      expect(exported).toContain('span:');
    });
  });

  describe('Filtered Export', () => {
    it('should filter by time (lastMs)', async () => {
      logger.info('Old log');
      await new Promise((r) => setTimeout(r, 100));
      logger.info('New log');

      const exported = logger.exportLogs({ format: 'json', lastMs: 50 });
      const parsed = JSON.parse(exported);
      expect(parsed.length).toBe(1);
      expect(parsed[0].message).toBe('New log');
    });

    it('should filter by levels', () => {
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      const exported = logger.exportLogs({ format: 'json', levels: ['warn', 'error'] });
      const parsed = JSON.parse(exported);
      expect(parsed.length).toBe(2);
      expect(parsed.map((l: { level: string }) => l.level)).toEqual(['warn', 'error']);
    });

    it('should filter by search', () => {
      logger.info('User logged in');
      logger.info('User logged out');
      logger.info('System started');

      const exported = logger.exportLogs({ format: 'json', search: 'logged' });
      const parsed = JSON.parse(exported);
      expect(parsed.length).toBe(2);
    });

    it('should combine multiple filters', () => {
      logger.info('User logged in');
      logger.warn('User warning');
      logger.error('System error');

      const exported = logger.exportLogs({
        format: 'json',
        levels: ['warn', 'error'],
        search: 'User',
      });
      const parsed = JSON.parse(exported);
      expect(parsed.length).toBe(1);
      expect(parsed[0].message).toBe('User warning');
    });
  });

  describe('Copy to Clipboard', () => {
    it('should copy logs to clipboard', async () => {
      // Mock clipboard API
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText },
      });

      logger.info('Test');
      const result = await logger.copyLogs();

      expect(result).toBe(true);
      expect(writeText).toHaveBeenCalled();
    });

    it('should return false on clipboard error', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
        },
      });

      logger.info('Test');
      const result = await logger.copyLogs();
      expect(result).toBe(false);
    });
  });
});
