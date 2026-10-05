/**
 * Tests for Global Error Capture
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../core/logger';
import { ErrorCapture } from '../core/error-capture';

describe('ErrorCapture', () => {
  beforeEach(() => {
    logger.clear();
    ErrorCapture.uninstall();
  });

  afterEach(() => {
    ErrorCapture.uninstall();
    logger.clear();
  });

  describe('Installation', () => {
    it('should install error handlers', () => {
      expect(ErrorCapture.isActive()).toBe(false);

      ErrorCapture.install();

      expect(ErrorCapture.isActive()).toBe(true);
    });

    it('should uninstall error handlers', () => {
      ErrorCapture.install();
      expect(ErrorCapture.isActive()).toBe(true);

      ErrorCapture.uninstall();
      expect(ErrorCapture.isActive()).toBe(false);
    });

    it('should handle multiple install calls', () => {
      ErrorCapture.install();
      ErrorCapture.install();
      ErrorCapture.install();

      expect(ErrorCapture.isActive()).toBe(true);
    });

    it('should handle multiple uninstall calls', () => {
      ErrorCapture.install();
      ErrorCapture.uninstall();
      ErrorCapture.uninstall();
      ErrorCapture.uninstall();

      expect(ErrorCapture.isActive()).toBe(false);
    });

    it('should handle uninstall without install', () => {
      expect(() => {
        ErrorCapture.uninstall();
      }).not.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      ErrorCapture.install();

      const config = ErrorCapture.getConfig();
      expect(config.captureErrors).toBe(true);
      expect(config.captureRejections).toBe(true);
      expect(config.errorPrefix).toBe('[Uncaught Error]');
      expect(config.rejectionPrefix).toBe('[Unhandled Rejection]');
    });

    it('should accept custom configuration', () => {
      ErrorCapture.install({
        captureErrors: true,
        captureRejections: false,
        errorPrefix: '[ERROR]',
        rejectionPrefix: '[REJECTION]',
      });

      const config = ErrorCapture.getConfig();
      expect(config.captureErrors).toBe(true);
      expect(config.captureRejections).toBe(false);
      expect(config.errorPrefix).toBe('[ERROR]');
      expect(config.rejectionPrefix).toBe('[REJECTION]');
    });

    it('should update config on re-install', () => {
      ErrorCapture.install({ errorPrefix: '[ERR1]' });
      expect(ErrorCapture.getConfig().errorPrefix).toBe('[ERR1]');

      ErrorCapture.install({ errorPrefix: '[ERR2]' });
      expect(ErrorCapture.getConfig().errorPrefix).toBe('[ERR2]');
    });

    it('should return copy of config', () => {
      ErrorCapture.install();

      const config1 = ErrorCapture.getConfig();
      const config2 = ErrorCapture.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('Error Capture', () => {
    it('should capture errors via window.onerror', () => {
      ErrorCapture.install();

      // Simulate window.onerror call
      const onerror = window.onerror as OnErrorEventHandler;
      if (onerror) {
        onerror('Test error message', 'test.js', 42, 10, new Error('Test error'));
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toContain('[Uncaught Error]');
      expect(logs[0].message).toContain('Test error');
    });

    it('should capture error details', () => {
      ErrorCapture.install();

      const testError = new Error('Detailed error');
      testError.name = 'CustomError';

      const onerror = window.onerror as OnErrorEventHandler;
      if (onerror) {
        onerror('Error event', 'app.js', 100, 5, testError);
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(1);

      const data = logs[0].data[0] as Record<string, unknown>;
      expect(data.source).toBe('app.js');
      expect(data.line).toBe(100);
      expect(data.column).toBe(5);
      expect((data.originalError as Record<string, unknown>).name).toBe('CustomError');
    });

    it('should handle string error events', () => {
      ErrorCapture.install();

      const onerror = window.onerror as OnErrorEventHandler;
      if (onerror) {
        onerror('Simple string error', undefined, undefined, undefined, undefined);
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toContain('Simple string error');
    });

    it('should use custom error prefix', () => {
      ErrorCapture.install({ errorPrefix: '[CUSTOM]' });

      const onerror = window.onerror as OnErrorEventHandler;
      if (onerror) {
        onerror('Test', 'test.js', 1, 1, new Error('Test'));
      }

      const logs = logger.getLogs();
      expect(logs[0].message).toContain('[CUSTOM]');
    });
  });

  describe('Promise Rejection Capture', () => {
    it('should capture unhandled rejections with Error', () => {
      ErrorCapture.install();

      // Simulate unhandledrejection event
      const event = new PromiseRejectionEvent('unhandledrejection', {
        reason: new Error('Promise failed'),
        promise: Promise.resolve(),
      });

      window.dispatchEvent(event);

      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].message).toContain('[Unhandled Rejection]');
      expect(logs[0].message).toContain('Promise failed');
    });

    it('should capture rejection with string reason', () => {
      ErrorCapture.install();

      const event = new PromiseRejectionEvent('unhandledrejection', {
        reason: 'String rejection reason',
        promise: Promise.resolve(),
      });

      window.dispatchEvent(event);

      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toContain('String rejection reason');
    });

    it('should capture rejection with unknown reason', () => {
      ErrorCapture.install();

      const event = new PromiseRejectionEvent('unhandledrejection', {
        reason: { custom: 'object' },
        promise: Promise.resolve(),
      });

      window.dispatchEvent(event);

      const logs = logger.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toContain('Unknown rejection reason');
    });

    it('should use custom rejection prefix', () => {
      ErrorCapture.install({ rejectionPrefix: '[REJECTED]' });

      const event = new PromiseRejectionEvent('unhandledrejection', {
        reason: new Error('Test'),
        promise: Promise.resolve(),
      });

      window.dispatchEvent(event);

      const logs = logger.getLogs();
      expect(logs[0].message).toContain('[REJECTED]');
    });
  });

  describe('Handler Chaining', () => {
    it('should preserve original onerror handler', () => {
      const originalCalled = vi.fn();
      window.onerror = () => {
        originalCalled();
        return false;
      };

      ErrorCapture.install();

      const onerror = window.onerror as OnErrorEventHandler;
      if (onerror) {
        onerror('Test', 'test.js', 1, 1, new Error('Test'));
      }

      expect(originalCalled).toHaveBeenCalled();
      expect(logger.getLogs().length).toBe(1);
    });

    it('should restore original onerror on uninstall', () => {
      const originalHandler = vi.fn();
      window.onerror = originalHandler;

      ErrorCapture.install();
      expect(window.onerror).not.toBe(originalHandler);

      ErrorCapture.uninstall();
      expect(window.onerror).toBe(originalHandler);
    });

    it('should handle errors in original handler', () => {
      window.onerror = () => {
        throw new Error('Handler error');
      };

      ErrorCapture.install();

      // Should not throw despite original handler throwing
      const onerror = window.onerror as OnErrorEventHandler;
      expect(() => {
        if (onerror) {
          onerror('Test', 'test.js', 1, 1, new Error('Test'));
        }
      }).not.toThrow();
    });
  });

  describe('Selective Capture', () => {
    it('should only capture errors when captureErrors is true', () => {
      ErrorCapture.install({ captureErrors: true, captureRejections: false });

      const onerror = window.onerror as OnErrorEventHandler;
      if (onerror) {
        onerror('Test', 'test.js', 1, 1, new Error('Test'));
      }

      expect(logger.getLogs().length).toBe(1);
    });

    it('should not install error handler when captureErrors is false', () => {
      const originalOnerror = window.onerror;

      ErrorCapture.install({ captureErrors: false, captureRejections: true });

      // onerror should still be the original (or null)
      expect(window.onerror).toBe(originalOnerror);
    });
  });

  describe('Zero-Throw Policy', () => {
    it('should never throw from error handler', () => {
      ErrorCapture.install();

      // Disable logger to cause potential issues
      logger.configure({ enabled: false });

      const onerror = window.onerror as OnErrorEventHandler;
      expect(() => {
        if (onerror) {
          onerror('Test', 'test.js', 1, 1, new Error('Test'));
        }
      }).not.toThrow();
    });

    it('should never throw from rejection handler', () => {
      ErrorCapture.install();

      logger.configure({ enabled: false });

      expect(() => {
        const event = new PromiseRejectionEvent('unhandledrejection', {
          reason: new Error('Test'),
          promise: Promise.resolve(),
        });
        window.dispatchEvent(event);
      }).not.toThrow();
    });
  });
});

describe('ErrorCapture Noop', () => {
  it('should export noop ErrorCapture from noop module', async () => {
    const noop = await import('../noop');

    expect(noop.ErrorCapture).toBeDefined();
    expect(typeof noop.ErrorCapture.install).toBe('function');
    expect(typeof noop.ErrorCapture.uninstall).toBe('function');
    expect(typeof noop.ErrorCapture.isActive).toBe('function');
    expect(typeof noop.ErrorCapture.getConfig).toBe('function');

    // Should not throw
    expect(() => {
      noop.ErrorCapture.install();
      noop.ErrorCapture.uninstall();
    }).not.toThrow();

    expect(noop.ErrorCapture.isActive()).toBe(false);
  });
});
