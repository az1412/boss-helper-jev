/**
 * Tests for Visual Diff, Network Capture, and Timeline features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../core/logger';
import { computeDiff, createDiffResult, hasChanges, formatValue } from '../core/diff';
import { NetworkCapture } from '../core/network-capture';

// =============================================================================
// Visual Diff Tests
// =============================================================================

describe('Visual Diff', () => {
  beforeEach(() => {
    logger.clear();
  });

  describe('computeDiff', () => {
    it('should detect added properties', () => {
      const oldObj = { a: 1 };
      const newObj = { a: 1, b: 2 };
      const diff = computeDiff(oldObj, newObj);

      expect(diff).toHaveLength(1);
      expect(diff[0]).toEqual({
        path: 'b',
        type: 'added',
        newValue: 2,
      });
    });

    it('should detect removed properties', () => {
      const oldObj = { a: 1, b: 2 };
      const newObj = { a: 1 };
      const diff = computeDiff(oldObj, newObj);

      expect(diff).toHaveLength(1);
      expect(diff[0]).toEqual({
        path: 'b',
        type: 'removed',
        oldValue: 2,
      });
    });

    it('should detect changed properties', () => {
      const oldObj = { a: 1 };
      const newObj = { a: 2 };
      const diff = computeDiff(oldObj, newObj);

      expect(diff).toHaveLength(1);
      expect(diff[0]).toEqual({
        path: 'a',
        type: 'changed',
        oldValue: 1,
        newValue: 2,
      });
    });

    it('should handle nested objects', () => {
      const oldObj = { user: { name: 'Alice', age: 30 } };
      const newObj = { user: { name: 'Alice', age: 31 } };
      const diff = computeDiff(oldObj, newObj);

      expect(diff).toHaveLength(1);
      expect(diff[0]).toEqual({
        path: 'user.age',
        type: 'changed',
        oldValue: 30,
        newValue: 31,
      });
    });

    it('should handle deeply nested objects', () => {
      const oldObj = { a: { b: { c: { d: 1 } } } };
      const newObj = { a: { b: { c: { d: 2 } } } };
      const diff = computeDiff(oldObj, newObj);

      expect(diff).toHaveLength(1);
      expect(diff[0].path).toBe('a.b.c.d');
    });

    it('should detect array changes', () => {
      const oldObj = { items: [1, 2, 3] };
      const newObj = { items: [1, 2, 3, 4] };
      const diff = computeDiff(oldObj, newObj);

      expect(diff).toHaveLength(1);
      expect(diff[0].type).toBe('changed');
    });

    it('should return empty array for identical objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const diff = computeDiff(obj, obj);

      expect(diff).toHaveLength(0);
    });

    it('should handle null and undefined', () => {
      const oldObj = { a: null, b: 1 };
      const newObj = { a: undefined, b: 1 };
      const diff = computeDiff(oldObj, newObj);

      expect(diff).toHaveLength(1);
      expect(diff[0].type).toBe('changed');
    });

    it('should handle type changes', () => {
      const oldObj = { value: '123' };
      const newObj = { value: 123 };
      const diff = computeDiff(oldObj, newObj);

      expect(diff).toHaveLength(1);
      expect(diff[0].type).toBe('changed');
    });
  });

  describe('createDiffResult', () => {
    it('should create summary with counts', () => {
      const oldObj = { a: 1, b: 2 };
      const newObj = { a: 2, c: 3 };
      const result = createDiffResult(oldObj, newObj);

      expect(result.summary).toEqual({
        added: 1, // c
        removed: 1, // b
        changed: 1, // a
        unchanged: 0,
      });
    });

    it('should return empty result for identical objects', () => {
      const obj = { a: 1 };
      const result = createDiffResult(obj, obj);

      expect(result.summary).toEqual({
        added: 0,
        removed: 0,
        changed: 0,
        unchanged: 0,
      });
    });
  });

  describe('hasChanges', () => {
    it('should return true when there are changes', () => {
      const result = createDiffResult({ a: 1 }, { a: 2 });
      expect(hasChanges(result)).toBe(true);
    });

    it('should return false when there are no changes', () => {
      const result = createDiffResult({ a: 1 }, { a: 1 });
      expect(hasChanges(result)).toBe(false);
    });
  });

  describe('formatValue', () => {
    it('should format primitives correctly', () => {
      expect(formatValue(undefined)).toBe('undefined');
      expect(formatValue(null)).toBe('null');
      expect(formatValue(42)).toBe('42');
      expect(formatValue(true)).toBe('true');
      expect(formatValue('hello')).toBe('"hello"');
    });

    it('should format arrays', () => {
      expect(formatValue([])).toBe('[]');
      expect(formatValue([1, 2])).toBe('[1, 2]');
      expect(formatValue([1, 2, 3, 4, 5])).toBe('[5 items]');
    });

    it('should format objects', () => {
      expect(formatValue({})).toBe('{}');
      expect(formatValue({ a: 1 })).toBe('{a: 1}');
      expect(formatValue({ a: 1, b: 2, c: 3, d: 4 })).toBe('{4 keys}');
    });
  });

  describe('logger.diff', () => {
    it('should log diff and return result', () => {
      const oldObj = { name: 'Alice' };
      const newObj = { name: 'Bob' };

      const result = logger.diff('Name changed', oldObj, newObj);

      expect(result.summary.changed).toBe(1);

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Name changed');
      expect(logs[0].data[0]).toHaveProperty('__type', 'Diff');
    });

    it('should use specified log level', () => {
      const result = logger.diff('Warning diff', {}, { a: 1 }, 'warn');

      expect(result.summary.added).toBe(1);

      const logs = logger.getLogs();
      expect(logs[0].level).toBe('warn');
    });

    it('should default to info level', () => {
      logger.diff('Info diff', {}, {});

      const logs = logger.getLogs();
      expect(logs[0].level).toBe('info');
    });
  });

  describe('logger.computeDiff', () => {
    it('should compute diff without logging', () => {
      const initialLogs = logger.getLogs().length;

      const result = logger.computeDiff({ a: 1 }, { a: 2 });

      expect(result.summary.changed).toBe(1);
      expect(logger.getLogs().length).toBe(initialLogs);
    });
  });
});

// =============================================================================
// Network Capture Tests
// =============================================================================

describe('NetworkCapture', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    logger.clear();
    originalFetch = globalThis.fetch;
    NetworkCapture.uninstall();
  });

  afterEach(() => {
    NetworkCapture.uninstall();
    globalThis.fetch = originalFetch;
  });

  describe('install/uninstall', () => {
    it('should not be active initially', () => {
      expect(NetworkCapture.isActive()).toBe(false);
    });

    it('should activate on install', () => {
      NetworkCapture.install();
      expect(NetworkCapture.isActive()).toBe(true);
    });

    it('should deactivate on uninstall', () => {
      NetworkCapture.install();
      NetworkCapture.uninstall();
      expect(NetworkCapture.isActive()).toBe(false);
    });

    it('should handle multiple installs gracefully', () => {
      NetworkCapture.install();
      NetworkCapture.install();
      expect(NetworkCapture.isActive()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return default config', () => {
      const config = NetworkCapture.getConfig();

      expect(config.captureFetch).toBe(true);
      expect(config.captureXHR).toBe(true);
      expect(config.includeHeaders).toBe(false);
      expect(config.includeBody).toBe(false);
      expect(config.includeResponse).toBe(false);
      expect(config.maxResponseLength).toBe(1000);
    });

    it('should merge custom config', () => {
      NetworkCapture.install({
        includeHeaders: true,
        maxResponseLength: 5000,
      });

      const config = NetworkCapture.getConfig();
      expect(config.includeHeaders).toBe(true);
      expect(config.maxResponseLength).toBe(5000);
    });
  });

  describe('addIgnorePattern', () => {
    it('should add ignore patterns', () => {
      NetworkCapture.install();
      NetworkCapture.addIgnorePattern('/analytics');
      NetworkCapture.addIgnorePattern(/\.hot-update\./);

      const config = NetworkCapture.getConfig();
      expect(config.ignorePatterns).toHaveLength(2);
    });
  });

  describe('fetch interception', () => {
    it('should intercept fetch calls when installed', async () => {
      // Mock fetch
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        clone: () => mockResponse,
        text: () => Promise.resolve('{"data": "test"}'),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      NetworkCapture.install();

      await fetch('/api/test');

      // Wait for async logging
      await new Promise((r) => setTimeout(r, 50));

      const logs = logger.getLogs();
      const spans = logger.getSpans();

      // Should have created a span for the request
      expect(spans.length).toBeGreaterThan(0);
    });

    it('should not intercept when ignoring patterns match', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        clone: () => mockResponse,
        text: () => Promise.resolve(''),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      NetworkCapture.install({
        ignorePatterns: ['/analytics'],
      });

      await fetch('/analytics/track');

      // Wait for async logging
      await new Promise((r) => setTimeout(r, 50));

      const spans = logger.getSpans();
      // Should not have created a span for ignored URL
      expect(spans.filter((s) => s.name.includes('analytics'))).toHaveLength(0);
    });
  });
});

// =============================================================================
// Note: Timeline tests require DOM environment with canvas support
// Basic structure tests can still be performed
// =============================================================================

describe('Timeline', () => {
  it('should export Timeline class and createTimeline function', async () => {
    const { Timeline, createTimeline } = await import('../ui/timeline');

    expect(Timeline).toBeDefined();
    expect(createTimeline).toBeDefined();
    expect(typeof createTimeline).toBe('function');
  });
});
