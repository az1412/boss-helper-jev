/**
 * Timeline / Flame-View Component
 *
 * Lightweight timeline visualization for logs and spans.
 * Features:
 * - Logs displayed on time axis
 * - Spans visualized as bars
 * - Zoom to last X seconds
 * - Hover for details
 */

import { logger } from '../core/logger';
import type { LogEvent, SpanEvent, LogLevel } from '../core/types';

/**
 * Timeline configuration
 */
export interface TimelineConfig {
  /** Container element or selector */
  container: HTMLElement | string;
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  timeWindow?: number;
  /** Auto-refresh interval in ms (default: 1000) */
  refreshInterval?: number;
  /** Show span bars (default: true) */
  showSpans?: boolean;
  /** Show log markers (default: true) */
  showLogs?: boolean;
  /** Height of timeline in pixels (default: 200) */
  height?: number;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '#6e6e6e',
  info: '#3794ff',
  warn: '#cca700',
  error: '#f14c4c',
};

const SPAN_STATUS_COLORS = {
  running: '#3794ff',
  success: '#4caf50',
  error: '#f14c4c',
};

/**
 * Timeline class
 */
export class Timeline {
  private container: HTMLElement;
  private config: Required<TimelineConfig>;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private intervalId: number | null = null;
  private tooltip: HTMLElement | null = null;
  // Bounds maps to avoid mutating readonly objects
  private spanBounds: Map<string, { x: number; y: number; w: number; h: number }> = new Map();
  private logBounds: Map<string, { x: number; y: number; r: number }> = new Map();

  constructor(userConfig: TimelineConfig) {
    const containerEl =
      typeof userConfig.container === 'string'
        ? document.querySelector<HTMLElement>(userConfig.container)
        : userConfig.container;

    if (!containerEl) {
      throw new Error('Timeline: Container not found');
    }

    this.container = containerEl;
    this.config = {
      container: containerEl,
      timeWindow: userConfig.timeWindow ?? 60000,
      refreshInterval: userConfig.refreshInterval ?? 1000,
      showSpans: userConfig.showSpans ?? true,
      showLogs: userConfig.showLogs ?? true,
      height: userConfig.height ?? 200,
    };

    this.init();
  }

  private init(): void {
    // Create container structure
    this.container.innerHTML = `
      <div class="devlogger-timeline" style="
        position: relative;
        background: #1e1e1e;
        border: 1px solid #3c3c3c;
        border-radius: 4px;
        overflow: hidden;
      ">
        <div class="timeline-header" style="
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: #252526;
          border-bottom: 1px solid #3c3c3c;
          font-family: 'SF Mono', monospace;
          font-size: 12px;
          color: #ccc;
        ">
          <span>Timeline</span>
          <div class="timeline-controls">
            <button data-window="10000" style="
              background: transparent;
              border: 1px solid #3c3c3c;
              color: #858585;
              padding: 2px 8px;
              border-radius: 3px;
              cursor: pointer;
              margin-left: 4px;
              font-size: 11px;
            ">10s</button>
            <button data-window="30000" style="
              background: transparent;
              border: 1px solid #3c3c3c;
              color: #858585;
              padding: 2px 8px;
              border-radius: 3px;
              cursor: pointer;
              margin-left: 4px;
              font-size: 11px;
            ">30s</button>
            <button data-window="60000" style="
              background: #0e639c;
              border: 1px solid #0e639c;
              color: white;
              padding: 2px 8px;
              border-radius: 3px;
              cursor: pointer;
              margin-left: 4px;
              font-size: 11px;
            ">1m</button>
            <button data-window="300000" style="
              background: transparent;
              border: 1px solid #3c3c3c;
              color: #858585;
              padding: 2px 8px;
              border-radius: 3px;
              cursor: pointer;
              margin-left: 4px;
              font-size: 11px;
            ">5m</button>
          </div>
        </div>
        <div class="timeline-canvas-container" style="position: relative;">
          <canvas class="timeline-canvas"></canvas>
        </div>
        <div class="timeline-tooltip" style="
          position: absolute;
          display: none;
          background: #333;
          border: 1px solid #555;
          padding: 8px;
          border-radius: 4px;
          font-family: 'SF Mono', monospace;
          font-size: 11px;
          color: #ccc;
          max-width: 300px;
          z-index: 1000;
          pointer-events: none;
        "></div>
      </div>
    `;

    // Get elements
    this.canvas = this.container.querySelector('.timeline-canvas');
    this.tooltip = this.container.querySelector('.timeline-tooltip');

    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.resizeCanvas();
    }

    // Set up controls
    this.container.querySelectorAll('[data-window]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const window = parseInt(target.dataset.window || '60000', 10);
        this.setTimeWindow(window);

        // Update button styles
        this.container.querySelectorAll('[data-window]').forEach((b) => {
          const el = b as HTMLButtonElement;
          if (el === target) {
            el.style.background = '#0e639c';
            el.style.borderColor = '#0e639c';
            el.style.color = 'white';
          } else {
            el.style.background = 'transparent';
            el.style.borderColor = '#3c3c3c';
            el.style.color = '#858585';
          }
        });
      });
    });

    // Set up mouse events for tooltip
    if (this.canvas) {
      this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
      this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    // Start auto-refresh
    this.startRefresh();
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width - 2; // Account for border
    this.canvas.height = this.config.height;
    this.render();
  }

  private startRefresh(): void {
    if (this.intervalId) return;
    this.intervalId = window.setInterval(() => this.render(), this.config.refreshInterval);
    this.render();
  }

  private stopRefresh(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setTimeWindow(ms: number): void {
    this.config.timeWindow = ms;
    this.render();
  }

  private render(): void {
    if (!this.canvas || !this.ctx) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const now = Date.now();
    const startTime = now - this.config.timeWindow;

    // Clear canvas
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    // Clear bounds maps
    this.spanBounds.clear();
    this.logBounds.clear();

    // Draw time grid
    this.drawTimeGrid(ctx, width, height, startTime, now);

    // Get data
    const logs = logger.getLogs().filter((l) => l.timestamp >= startTime);
    const spans = logger.getSpans().filter((s) => s.startTime >= startTime || (s.endTime && s.endTime >= startTime));

    // Draw spans
    if (this.config.showSpans) {
      this.drawSpans(ctx, spans, width, height, startTime, now);
    }

    // Draw log markers
    if (this.config.showLogs) {
      this.drawLogs(ctx, logs, width, height, startTime, now);
    }
  }

  private drawTimeGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    startTime: number,
    endTime: number
  ): void {
    const duration = endTime - startTime;
    const gridLines = 6;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.font = '10px SF Mono, monospace';
    ctx.fillStyle = '#666';

    for (let i = 0; i <= gridLines; i++) {
      const x = (i / gridLines) * width;
      const time = startTime + (duration * i) / gridLines;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Time label
      const date = new Date(time);
      const label = `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
      ctx.fillText(label, x + 2, height - 4);
    }
  }

  private drawSpans(
    ctx: CanvasRenderingContext2D,
    spans: readonly SpanEvent[],
    width: number,
    _height: number,
    startTime: number,
    endTime: number
  ): void {
    const duration = endTime - startTime;
    const spanHeight = 20;
    const spanMargin = 4;
    const topOffset = 20;

    // Group spans by parent for nesting
    const rootSpans = spans.filter((s) => !s.parentId);
    let yOffset = topOffset;

    const drawSpan = (span: SpanEvent, y: number, _depth: number = 0): number => {
      const x1 = ((span.startTime - startTime) / duration) * width;
      const x2 = ((span.endTime || endTime) - startTime) / duration * width;
      const barWidth = Math.max(x2 - x1, 2);

      const color = SPAN_STATUS_COLORS[span.status];

      // Draw span bar
      ctx.fillStyle = color + '40'; // Semi-transparent
      ctx.fillRect(x1, y, barWidth, spanHeight);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, y, barWidth, spanHeight);

      // Draw span name
      ctx.fillStyle = '#ccc';
      ctx.font = '10px SF Mono, monospace';
      const label = span.duration ? `${span.name} (${span.duration}ms)` : span.name;
      ctx.fillText(label, x1 + 4, y + 14, barWidth - 8);

      // Store for hit testing (in map to avoid mutating readonly object)
      this.spanBounds.set(span.id, {
        x: x1,
        y,
        w: barWidth,
        h: spanHeight,
      });

      return y + spanHeight + spanMargin;
    };

    for (const span of rootSpans) {
      yOffset = drawSpan(span, yOffset);
    }
  }

  private drawLogs(
    ctx: CanvasRenderingContext2D,
    logs: readonly LogEvent[],
    width: number,
    height: number,
    startTime: number,
    endTime: number
  ): void {
    const duration = endTime - startTime;
    const markerHeight = 8;
    const bottomOffset = 30;

    for (const log of logs) {
      const x = ((log.timestamp - startTime) / duration) * width;
      const color = LEVEL_COLORS[log.level];

      // Draw marker
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, height - bottomOffset);
      ctx.lineTo(x - markerHeight / 2, height - bottomOffset - markerHeight);
      ctx.lineTo(x + markerHeight / 2, height - bottomOffset - markerHeight);
      ctx.closePath();
      ctx.fill();

      // Store for hit testing (in map to avoid mutating readonly object)
      this.logBounds.set(log.id, {
        x,
        y: height - bottomOffset - markerHeight / 2,
        r: markerHeight,
      });
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.canvas || !this.tooltip) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check spans
    for (const span of logger.getSpans()) {
      const bounds = this.spanBounds.get(span.id);
      if (bounds && x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h) {
        this.showTooltip(e, `
          <strong>${span.name}</strong><br>
          Status: ${span.status}<br>
          ${span.duration !== undefined ? `Duration: ${span.duration}ms` : 'Running...'}<br>
          ${span.context ? `Context: ${JSON.stringify(span.context)}` : ''}
        `);
        return;
      }
    }

    // Check logs
    for (const log of logger.getLogs()) {
      const bounds = this.logBounds.get(log.id);
      if (bounds) {
        const dist = Math.sqrt((x - bounds.x) ** 2 + (y - bounds.y) ** 2);
        if (dist <= bounds.r) {
          this.showTooltip(e, `
            <strong>[${log.level.toUpperCase()}]</strong> ${log.message}<br>
            <small>${new Date(log.timestamp).toISOString()}</small>
          `);
          return;
        }
      }
    }

    this.hideTooltip();
  }

  private handleMouseLeave(): void {
    this.hideTooltip();
  }

  private showTooltip(e: MouseEvent, html: string): void {
    if (!this.tooltip) return;
    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${e.offsetX + 10}px`;
    this.tooltip.style.top = `${e.offsetY + 10}px`;
  }

  private hideTooltip(): void {
    if (!this.tooltip) return;
    this.tooltip.style.display = 'none';
  }

  /**
   * Destroy the timeline
   */
  destroy(): void {
    this.stopRefresh();
    this.container.innerHTML = '';
  }
}

/**
 * Create a timeline instance
 */
export function createTimeline(config: TimelineConfig): Timeline {
  return new Timeline(config);
}
