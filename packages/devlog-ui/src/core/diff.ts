/**
 * Object Diff Utility
 *
 * Compares two objects and returns a detailed diff.
 * Handles nested objects, arrays, and primitive values.
 */

import type { DiffEntry, DiffResult } from './types';

/**
 * Check if value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Check if two values are deeply equal
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Format a value for display (handles special types)
 */
export function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length <= 3) return `[${value.map(formatValue).join(', ')}]`;
    return `[${value.length} items]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    if (keys.length <= 2) {
      return `{${keys.map((k) => `${k}: ${formatValue(value[k])}`).join(', ')}}`;
    }
    return `{${keys.length} keys}`;
  }
  return String(value);
}

/**
 * Compute diff between two objects
 */
export function computeDiff(
  oldObj: unknown,
  newObj: unknown,
  path: string = '',
  includeUnchanged: boolean = false
): DiffEntry[] {
  const entries: DiffEntry[] = [];

  // Handle non-object cases
  if (!isPlainObject(oldObj) && !isPlainObject(newObj)) {
    if (!deepEqual(oldObj, newObj)) {
      entries.push({
        path: path || '(root)',
        type: 'changed',
        oldValue: oldObj,
        newValue: newObj,
      });
    } else if (includeUnchanged) {
      entries.push({
        path: path || '(root)',
        type: 'unchanged',
        oldValue: oldObj,
        newValue: newObj,
      });
    }
    return entries;
  }

  // Handle one side being non-object
  if (!isPlainObject(oldObj)) {
    entries.push({
      path: path || '(root)',
      type: 'changed',
      oldValue: oldObj,
      newValue: newObj,
    });
    return entries;
  }
  if (!isPlainObject(newObj)) {
    entries.push({
      path: path || '(root)',
      type: 'changed',
      oldValue: oldObj,
      newValue: newObj,
    });
    return entries;
  }

  // Both are objects - compare keys
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    const oldHas = key in oldObj;
    const newHas = key in newObj;

    if (!oldHas && newHas) {
      // Added
      entries.push({
        path: fullPath,
        type: 'added',
        newValue: newVal,
      });
    } else if (oldHas && !newHas) {
      // Removed
      entries.push({
        path: fullPath,
        type: 'removed',
        oldValue: oldVal,
      });
    } else if (isPlainObject(oldVal) && isPlainObject(newVal)) {
      // Recurse into nested objects
      entries.push(...computeDiff(oldVal, newVal, fullPath, includeUnchanged));
    } else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      // Compare arrays
      if (!deepEqual(oldVal, newVal)) {
        entries.push({
          path: fullPath,
          type: 'changed',
          oldValue: oldVal,
          newValue: newVal,
        });
      } else if (includeUnchanged) {
        entries.push({
          path: fullPath,
          type: 'unchanged',
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    } else if (!deepEqual(oldVal, newVal)) {
      // Changed primitive
      entries.push({
        path: fullPath,
        type: 'changed',
        oldValue: oldVal,
        newValue: newVal,
      });
    } else if (includeUnchanged) {
      // Unchanged
      entries.push({
        path: fullPath,
        type: 'unchanged',
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return entries;
}

/**
 * Create a full diff result with summary
 */
export function createDiffResult(oldObj: unknown, newObj: unknown): DiffResult {
  const changes = computeDiff(oldObj, newObj, '', false);

  const summary = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
  };

  for (const change of changes) {
    summary[change.type]++;
  }

  return { changes, summary };
}

/**
 * Check if there are any changes
 */
export function hasChanges(diff: DiffResult): boolean {
  return diff.summary.added > 0 || diff.summary.removed > 0 || diff.summary.changed > 0;
}
