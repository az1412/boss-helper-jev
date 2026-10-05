/**
 * UI Styles for DevLogger
 *
 * CSS-in-JS for Shadow DOM isolation.
 * Design philosophy: Clean, readable, non-intrusive.
 */

export const DARK_COLORS = {
  // Background
  bgPrimary: '#1e1e1e',
  bgSecondary: '#252526',
  bgHover: '#2a2a2a',
  bgHeader: '#333333',

  // Text
  textPrimary: '#cccccc',
  textSecondary: '#858585',
  textMuted: '#6e6e6e',

  // Log Levels
  levelDebug: '#6e6e6e',
  levelInfo: '#3794ff',
  levelWarn: '#cca700',
  levelError: '#f14c4c',

  // Accents
  border: '#3c3c3c',
  scrollbar: '#4a4a4a',
  scrollbarHover: '#5a5a5a',

  // Interactive
  buttonBg: '#0e639c',
  buttonHover: '#1177bb',
} as const

export const COLORS = {
  // Background
  bgPrimary: '#ffffff',
  bgSecondary: '#f8f8f8',
  bgHover: '#f3f3f3',
  bgHeader: '#f5f5f5',

  // Text
  textPrimary: '#1f1f1f',
  textSecondary: '#5f5f5f',
  textMuted: '#8a8a8a',

  // Log Levels
  levelDebug: '#8a8a8a',
  levelInfo: '#005fb8',
  levelWarn: '#b76e00',
  levelError: '#d13438',

  // Accents
  border: '#dcdcdc',
  scrollbar: '#c2c2c2',
  scrollbarHover: '#a8a8a8',

  // Interactive
  buttonBg: '#0e639c',
  buttonHover: '#1177bb',
} as const

export const STYLES = `
  :host {
    --bg-primary: ${COLORS.bgPrimary};
    --bg-secondary: ${COLORS.bgSecondary};
    --bg-hover: ${COLORS.bgHover};
    --bg-header: ${COLORS.bgHeader};
    --text-primary: ${COLORS.textPrimary};
    --text-secondary: ${COLORS.textSecondary};
    --text-muted: ${COLORS.textMuted};
    --border: ${COLORS.border};

    all: initial;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-primary);
  }

  * {
    box-sizing: border-box;
  }

  /* Container */
  .devlogger-container {
    max-height: 700px;
    min-height: 400px;
    background: var(--bg-primary);
    display: flex;
    flex-direction: column;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  }

  /* Header */
  .devlogger-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg-header);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .devlogger-title {
    font-weight: 600;
    font-size: 13px;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .devlogger-badge {
    background: ${COLORS.levelInfo};
    color: white;
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 500;
  }

  .devlogger-actions {
    display: flex;
    gap: 4px;
  }

  .devlogger-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    transition: all 0.15s ease;
  }

  .devlogger-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .devlogger-btn.active {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .devlogger-btn-primary {
    background: ${COLORS.buttonBg};
    color: white;
  }

  .devlogger-btn-primary:hover {
    background: ${COLORS.buttonHover};
    color: white;
  }

  /* Log List */
  .devlogger-logs {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .devlogger-logs::-webkit-scrollbar {
    width: 8px;
  }

  .devlogger-logs::-webkit-scrollbar-track {
    background: var(--bg-primary);
  }

  .devlogger-logs::-webkit-scrollbar-thumb {
    background: ${COLORS.scrollbar};
    border-radius: 4px;
  }

  .devlogger-logs::-webkit-scrollbar-thumb:hover {
    background: ${COLORS.scrollbarHover};
  }

  .devlogger-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Log Entry */
  .log-entry {
    border-bottom: 1px solid var(--border);
    padding: 8px 12px;
    transition: background 0.1s ease;
  }

  .log-entry:hover {
    background: var(--bg-hover);
  }

  .log-entry-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .log-level {
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 3px;
    min-width: 45px;
    text-align: center;
  }

  .log-level-debug {
    background: rgba(110, 110, 110, 0.2);
    color: ${COLORS.levelDebug};
  }

  .log-level-info {
    background: rgba(55, 148, 255, 0.15);
    color: ${COLORS.levelInfo};
  }

  .log-level-warn {
    background: rgba(204, 167, 0, 0.15);
    color: ${COLORS.levelWarn};
  }

  .log-level-error {
    background: rgba(241, 76, 76, 0.15);
    color: ${COLORS.levelError};
  }

  .log-time {
    color: var(--text-muted);
    font-size: 11px;
  }

  .log-source {
    color: var(--text-secondary);
    font-size: 11px;
    margin-left: auto;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-source:hover {
    color: ${COLORS.levelInfo};
  }

  .log-context {
    font-size: 10px;
    color: ${COLORS.levelInfo};
    background: rgba(55, 148, 255, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-entry-in-span {
    border-left: 2px solid ${COLORS.levelInfo};
    padding-left: 10px;
  }

  .span-group {
    border-bottom: 1px solid var(--border);
  }

  .span-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-secondary);
    cursor: pointer;
  }

  .span-header:hover {
    background: var(--bg-hover);
  }

  .span-toggle {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px;
  }

  .span-toggle::before {
    content: '▾';
    display: inline-block;
    transition: transform 0.15s ease;
  }

  .span-group.collapsed .span-toggle::before {
    transform: rotate(-90deg);
  }

  .span-title {
    font-weight: 600;
    font-size: 12px;
    color: var(--text-primary);
  }

  .span-status {
    font-size: 10px;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 3px;
    color: var(--text-primary);
    background: var(--bg-primary);
  }

  .span-status-running {
    color: ${COLORS.levelInfo};
    background: rgba(55, 148, 255, 0.15);
  }

  .span-status-success {
    color: ${COLORS.levelInfo};
    background: rgba(55, 148, 255, 0.15);
  }

  .span-status-error {
    color: ${COLORS.levelError};
    background: rgba(241, 76, 76, 0.15);
  }

  .span-duration {
    color: var(--text-muted);
    font-size: 11px;
  }

  .span-count {
    margin-left: auto;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .span-logs {
    padding-left: 4px;
  }

  .span-group.collapsed .span-logs {
    display: none;
  }

  .log-message {
    color: var(--text-primary);
    word-break: break-word;
    margin-bottom: 4px;
  }

  /* Data Display */
  .log-data {
    margin-top: 6px;
  }

  .log-data-toggle {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 2px 0;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .log-data-toggle:hover {
    color: var(--text-primary);
  }

  .log-data-toggle::before {
    content: '▶';
    font-size: 8px;
    transition: transform 0.15s ease;
  }

  .log-data-toggle.expanded::before {
    transform: rotate(90deg);
  }

  .log-data-content {
    display: none;
    margin-top: 6px;
    padding: 8px;
    background: var(--bg-secondary);
    border-radius: 4px;
    font-size: 11px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .log-data-content.visible {
    display: block;
  }

  /* Toggle Button (floating) */
  .devlogger-toggle {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: ${COLORS.buttonBg};
    color: white;
    border: none;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    z-index: 99998;
  }

  .devlogger-toggle:hover {
    background: ${COLORS.buttonHover};
    transform: scale(1.05);
  }

  .devlogger-toggle.hidden {
    display: none;
  }

  /* Footer / Status */
  .devlogger-footer {
    padding: 6px 12px;
    background: var(--bg-header);
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--text-muted);
    display: flex;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .devlogger-shortcut {
    opacity: 0.7;
  }

  /* Resource Monitor */
  .resource-container {
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    padding: 8px 12px;
    display: none;
  }

  .resource-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    color: var(--text-secondary);
    font-size: 11px;
  }

  .resource-metrics {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 12px;
    font-size: 11px;
  }

  .resource-label {
    color: var(--text-muted);
  }

  .resource-value {
    color: var(--text-primary);
    font-weight: 600;
  }

  .resource-note {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 11px;
  }

  /* Filter Bar */
  .filter-bar {
    padding: 8px 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .filter-bar.filter-active {
    background: rgba(55, 148, 255, 0.08);
    border-bottom-color: ${COLORS.levelInfo};
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filter-levels {
    display: flex;
    gap: 2px;
  }

  .filter-level-btn {
    width: 24px;
    height: 24px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .filter-level-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .filter-level-btn.active {
    color: white;
  }

  .filter-level-btn.active[data-level="debug"] {
    background: ${COLORS.levelDebug};
    border-color: ${COLORS.levelDebug};
  }

  .filter-level-btn.active[data-level="info"] {
    background: ${COLORS.levelInfo};
    border-color: ${COLORS.levelInfo};
  }

  .filter-level-btn.active[data-level="warn"] {
    background: ${COLORS.levelWarn};
    border-color: ${COLORS.levelWarn};
  }

  .filter-level-btn.active[data-level="error"] {
    background: ${COLORS.levelError};
    border-color: ${COLORS.levelError};
  }

  .filter-search {
    flex: 1;
  }

  .filter-file {
    width: 120px;
  }

  .filter-input {
    width: 100%;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 11px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .filter-input::placeholder {
    color: var(--text-muted);
  }

  .filter-input:focus {
    border-color: ${COLORS.levelInfo};
  }

  .filter-clear-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: rgba(241, 76, 76, 0.2);
    color: ${COLORS.levelError};
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s ease;
  }

  .filter-clear-btn:hover {
    background: ${COLORS.levelError};
    color: white;
  }

  .filter-status {
    margin-top: 6px;
    font-size: 10px;
    color: ${COLORS.levelInfo};
  }

  /* No results state */
  .devlogger-no-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    gap: 8px;
  }

  .devlogger-no-results-icon {
    font-size: 24px;
    opacity: 0.5;
  }

  .devlogger-no-results-text {
    font-style: italic;
  }

  /* Diff Display */
  .diff-container {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 11px;
  }

  .diff-summary {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .diff-count {
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
  }

  .diff-count.diff-added {
    background: rgba(80, 200, 120, 0.2);
    color: #50c878;
  }

  .diff-count.diff-removed {
    background: rgba(241, 76, 76, 0.2);
    color: ${COLORS.levelError};
  }

  .diff-count.diff-changed {
    background: rgba(204, 167, 0, 0.2);
    color: ${COLORS.levelWarn};
  }

  .diff-count.diff-unchanged {
    background: var(--bg-hover);
    color: var(--text-muted);
  }

  .diff-changes {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .diff-entry {
    padding: 2px 6px;
    border-radius: 3px;
    display: flex;
    gap: 6px;
  }

  .diff-entry.diff-added {
    background: rgba(80, 200, 120, 0.1);
    color: #50c878;
  }

  .diff-entry.diff-removed {
    background: rgba(241, 76, 76, 0.1);
    color: ${COLORS.levelError};
  }

  .diff-entry.diff-changed {
    background: rgba(204, 167, 0, 0.1);
    color: ${COLORS.levelWarn};
  }

  .diff-icon {
    font-weight: bold;
    width: 12px;
    flex-shrink: 0;
  }

  .diff-path {
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .diff-value {
    word-break: break-all;
  }

  .log-data-diff .log-data-toggle {
    color: ${COLORS.levelInfo};
  }
`
