/**
 * Network Capture - Fetch/XHR Hook
 *
 * Automatically creates spans for network requests.
 * Captures request/response data and correlates with logs.
 */

import { logger } from './logger';
import type { LogContext } from './types';

/**
 * Network capture configuration
 */
export interface NetworkCaptureConfig {
  /** Capture fetch requests (default: true) */
  captureFetch?: boolean;
  /** Capture XHR requests (default: true) */
  captureXHR?: boolean;
  /** Include request headers (default: false, may contain sensitive data) */
  includeHeaders?: boolean;
  /** Include request body (default: false, may be large) */
  includeBody?: boolean;
  /** Include response body (default: false, may be large) */
  includeResponse?: boolean;
  /** Max response body length to capture (default: 1000) */
  maxResponseLength?: number;
  /** URL patterns to ignore (e.g., analytics, hot reload) */
  ignorePatterns?: (string | RegExp)[];
  /** Custom context to add to all network logs */
  context?: LogContext;
}

const DEFAULT_CONFIG: Required<NetworkCaptureConfig> = {
  captureFetch: true,
  captureXHR: true,
  includeHeaders: false,
  includeBody: false,
  includeResponse: false,
  maxResponseLength: 1000,
  ignorePatterns: [],
  context: {},
};

// Store original implementations
let originalFetch: typeof globalThis.fetch | null = null;
let originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
let originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;

let isActive = false;
let config: Required<NetworkCaptureConfig> = { ...DEFAULT_CONFIG };

/**
 * Check if URL should be ignored
 */
function shouldIgnore(url: string): boolean {
  for (const pattern of config.ignorePatterns) {
    if (typeof pattern === 'string') {
      if (url.includes(pattern)) return true;
    } else if (pattern.test(url)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract useful URL info
 */
function parseUrl(url: string): { host: string; path: string; full: string } {
  try {
    const parsed = new URL(url, window.location.origin);
    return {
      host: parsed.host,
      path: parsed.pathname + parsed.search,
      full: parsed.href,
    };
  } catch {
    return { host: 'unknown', path: url, full: url };
  }
}

/**
 * Truncate string if too long
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '... (truncated)';
}

/**
 * Safe JSON parse
 */
function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Create patched fetch function
 */
function createPatchedFetch(): typeof globalThis.fetch {
  return async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (shouldIgnore(url)) {
      return originalFetch!(input, init);
    }

    const { host, path } = parseUrl(url);
    const method = init?.method || 'GET';
    const spanName = `${method} ${path}`;

    const span = logger.span(spanName, {
      ...config.context,
      type: 'fetch',
      method,
      host,
    });

    span.info(`Request started: ${url}`);

    if (config.includeHeaders && init?.headers) {
      span.debug('Request headers', init.headers);
    }

    if (config.includeBody && init?.body) {
      try {
        const body = typeof init.body === 'string' ? safeParseJSON(init.body) : init.body;
        span.debug('Request body', body);
      } catch {
        span.debug('Request body', '[Unable to parse]');
      }
    }

    const startTime = performance.now();

    try {
      const response = await originalFetch!(input, init);
      const duration = Math.round(performance.now() - startTime);

      if (response.ok) {
        span.info(`Response: ${response.status} ${response.statusText} (${duration}ms)`);

        if (config.includeResponse) {
          try {
            const clone = response.clone();
            const text = await clone.text();
            const body = safeParseJSON(truncate(text, config.maxResponseLength));
            span.debug('Response body', body);
          } catch {
            span.debug('Response body', '[Unable to read]');
          }
        }

        span.end();
      } else {
        span.warn(`Response: ${response.status} ${response.statusText} (${duration}ms)`);
        span.fail();
      }

      return response;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      span.error(`Request failed after ${duration}ms`, error);
      span.fail();
      throw error;
    }
  };
}

/**
 * Patch XMLHttpRequest
 */
function patchXHR(): void {
  originalXHROpen = XMLHttpRequest.prototype.open;
  originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null
  ) {
    const urlStr = typeof url === 'string' ? url : url.href;

    // Store request info for later
    (this as XMLHttpRequest & { __networkCapture?: unknown }).__networkCapture = {
      method,
      url: urlStr,
      ignored: shouldIgnore(urlStr),
    };

    return originalXHROpen!.call(this, method, url, async, username, password);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const captureInfo = (this as XMLHttpRequest & { __networkCapture?: { method: string; url: string; ignored: boolean } }).__networkCapture;

    if (!captureInfo || captureInfo.ignored) {
      return originalXHRSend!.call(this, body);
    }

    const { method, url } = captureInfo;
    const { host, path } = parseUrl(url);
    const spanName = `${method} ${path}`;

    const span = logger.span(spanName, {
      ...config.context,
      type: 'xhr',
      method,
      host,
    });

    span.info(`XHR Request started: ${url}`);

    if (config.includeBody && body) {
      try {
        const bodyData = typeof body === 'string' ? safeParseJSON(body) : body;
        span.debug('Request body', bodyData);
      } catch {
        span.debug('Request body', '[Unable to parse]');
      }
    }

    const startTime = performance.now();

    this.addEventListener('load', () => {
      const duration = Math.round(performance.now() - startTime);

      if (this.status >= 200 && this.status < 400) {
        span.info(`Response: ${this.status} ${this.statusText} (${duration}ms)`);

        if (config.includeResponse && this.responseText) {
          const body = safeParseJSON(truncate(this.responseText, config.maxResponseLength));
          span.debug('Response body', body);
        }

        span.end();
      } else {
        span.warn(`Response: ${this.status} ${this.statusText} (${duration}ms)`);
        span.fail();
      }
    });

    this.addEventListener('error', () => {
      const duration = Math.round(performance.now() - startTime);
      span.error(`XHR Request failed after ${duration}ms`);
      span.fail();
    });

    this.addEventListener('abort', () => {
      const duration = Math.round(performance.now() - startTime);
      span.warn(`XHR Request aborted after ${duration}ms`);
      span.fail();
    });

    this.addEventListener('timeout', () => {
      const duration = Math.round(performance.now() - startTime);
      span.error(`XHR Request timeout after ${duration}ms`);
      span.fail();
    });

    return originalXHRSend!.call(this, body);
  };
}

/**
 * Restore original XHR
 */
function restoreXHR(): void {
  if (originalXHROpen) {
    XMLHttpRequest.prototype.open = originalXHROpen;
    originalXHROpen = null;
  }
  if (originalXHRSend) {
    XMLHttpRequest.prototype.send = originalXHRSend;
    originalXHRSend = null;
  }
}

/**
 * Network Capture API
 */
export const NetworkCapture = {
  /**
   * Install network capture hooks
   */
  install(userConfig: NetworkCaptureConfig = {}): void {
    try {
      if (isActive) {
        return;
      }

      config = { ...DEFAULT_CONFIG, ...userConfig };

      if (config.captureFetch && typeof globalThis.fetch === 'function') {
        originalFetch = globalThis.fetch;
        globalThis.fetch = createPatchedFetch();
      }

      if (config.captureXHR && typeof XMLHttpRequest !== 'undefined') {
        patchXHR();
      }

      isActive = true;
      logger.debug('[NetworkCapture] Installed', {
        fetch: config.captureFetch,
        xhr: config.captureXHR,
      });
    } catch (e) {
      console.warn('[NetworkCapture] Install error:', e);
    }
  },

  /**
   * Uninstall network capture hooks
   */
  uninstall(): void {
    try {
      if (!isActive) {
        return;
      }

      if (originalFetch) {
        globalThis.fetch = originalFetch;
        originalFetch = null;
      }

      restoreXHR();

      isActive = false;
      logger.debug('[NetworkCapture] Uninstalled');
    } catch (e) {
      console.warn('[NetworkCapture] Uninstall error:', e);
    }
  },

  /**
   * Check if capture is active
   */
  isActive(): boolean {
    return isActive;
  },

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<NetworkCaptureConfig>> {
    return { ...config };
  },

  /**
   * Update ignore patterns
   */
  addIgnorePattern(pattern: string | RegExp): void {
    config.ignorePatterns.push(pattern);
  },
};
