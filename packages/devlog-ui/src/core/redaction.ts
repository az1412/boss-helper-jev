/** Shared, non-mutating redaction for log capture, recovery and export. */
export const REDACTED = '[REDACTED]';

export function isSensitiveKey(key: string): boolean {
  let decoded = key;
  try { decoded = decodeURIComponent(key); } catch { /* Keep malformed keys readable. */ }
  const normalized = decoded.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized === 'key' || normalized === 'bst' || normalized === 'auth' ||
    /(?:token|apikey|authorization|authheader|cookie|password|passwordhash|passwd|secret|secretkey|securityid|credential|credentials|privatekey|accesskey|clientkey)$/.test(normalized);
}

/** Find a complete assigned value, including credential objects embedded in errors. */
function assignedValue(text: string): string | undefined {
  if (/^[[{]/.test(text) && !text.startsWith(REDACTED)) {
    let depth = 0;
    let quote = '';
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quote) {
        if (char === '\\') index++;
        else if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') {
        if (--depth === 0) return text.slice(0, index + 1);
      }
    }
    return text; // Incomplete credential value: omit rather than leak its tail.
  }
  return text.match(/^(?:\[REDACTED\]|\\+["'][\s\S]*?\\+["']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}\]"'<>]+)/)?.[0];
}

/** Redact credentials even when they are embedded in URLs or error text. */
export function redactText(text: string): string {
  const sanitized = text
    // URL userinfo is credential-bearing, independent of query parameter names.
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${REDACTED}@`)
    .replace(/\bBearer(?:\s|%20|\+)+(?!\[REDACTED\])[^\s"'<>;,)}\]]+/gi, `Bearer ${REDACTED}`)
    // Cookie headers can contain several arbitrary cookie names and spaces.
    .replace(/((?:["']?(?:set-cookie|cookie)["']?)\s*:\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n]+)/gi, `$1"${REDACTED}"`)
    // Query strings, including percent-encoded names and values, in URLs/stacks.
    .replace(/([?&#])([^=\s?&#]+)=([^&#\s"'<>]+)/g, (match, separator: string, key: string) =>
      isSensitiveKey(key) ? `${separator}${key}=${REDACTED}` : match);
  // Scan only the field prefix: consuming an innocuous value here would skip a
  // nested credential in e.g. "request failed: password='...'".
  const replacements: { start: number; end: number; text: string }[] = [];
  let coveredUntil = 0;
  for (const match of sanitized.matchAll(/((?:\\*["'])?)([a-zA-Z][\w.-]*)\1(\s*[:=]\s*)/g)) {
    if (match.index < coveredUntil || !isSensitiveKey(match[2]!)) continue;
    const start = match.index + match[0].length;
    const value = assignedValue(sanitized.slice(start));
    if (value) {
      coveredUntil = start + value.length;
      replacements.push({ start, end: coveredUntil, text: value === REDACTED ? REDACTED : `"${REDACTED}"` });
    }
  }
  let result = sanitized;
  for (const replacement of replacements.reverse()) {
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  }
  return result;
}

/** Preserve useful shape, never retain live objects, getters or toJSON hooks. */
export function redactLogValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 40) return '[Max Depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Serialized configuration/requests should receive the same nested-key policy.
    if (/^\s*[\[{]/.test(value)) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
          return JSON.stringify(redactLogValue(parsed, seen, depth + 1));
        }
      } catch { /* Not a JSON document; redact text fragments below. */ }
    }
    return redactText(value);
  }
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'symbol') return redactText(String(value));
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular Reference]';
  seen.add(value);

  try {
    if (value instanceof Date) return { __type: 'Date', value: value.toISOString() };
    if (value instanceof RegExp) return { __type: 'RegExp', value: redactText(value.toString()) };
    if (typeof URL !== 'undefined' && value instanceof URL) return redactText(value.href);
    if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
      return redactLogValue(Object.fromEntries(value), seen, depth + 1);
    }
    if (typeof Headers !== 'undefined' && value instanceof Headers) {
      return redactLogValue(Object.fromEntries(value.entries()), seen, depth + 1);
    }
    if (Array.isArray(value)) return value.map(item => redactLogValue(item, seen, depth + 1));
    if (value instanceof Map) {
      return Array.from(value, ([key, item]) => [redactLogValue(key, seen, depth + 1),
        typeof key === 'string' && isSensitiveKey(key) ? REDACTED : redactLogValue(item, seen, depth + 1)]);
    }
    if (value instanceof Set) return Array.from(value, item => redactLogValue(item, seen, depth + 1));

    const result: Record<string, unknown> = {};
    const keys = new Set(Object.keys(value));
    if (value instanceof Error) {
      result.__type = 'Error';
      for (const key of ['name', 'message', 'stack', 'cause']) keys.add(key);
    }
    for (const key of keys) {
      // Define rather than assign so an imported __proto__ is just a data field.
      Object.defineProperty(result, key, {
        value: isSensitiveKey(key) ? REDACTED : redactLogValue((value as Record<string, unknown>)[key], seen, depth + 1),
        enumerable: true, writable: true, configurable: true,
      });
    }
    return result;
  } catch {
    return '[Uncloneable Object]';
  }
}
