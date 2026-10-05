/**
 * BroadcastChannel Communication Layer
 *
 * Enables real-time synchronization between:
 * - Main app overlay
 * - Pop-out window
 * - Multiple tabs (future)
 */

import type { LogEvent } from '../core/types';

/** Channel name for DevLogger communication */
const CHANNEL_NAME = 'devlogger-sync';

/** Message types for channel communication */
export type MessageType =
  | 'NEW_LOG'
  | 'CLEAR_LOGS'
  | 'SYNC_REQUEST'
  | 'SYNC_RESPONSE'
  | 'PING'
  | 'PONG';

/** Message structure for channel communication */
export interface ChannelMessage {
  type: MessageType;
  payload?: unknown;
  senderId: string;
  timestamp: number;
}

/** Callback for message handlers */
export type MessageHandler = (message: ChannelMessage) => void;

/**
 * Generate a unique sender ID for this window/tab
 */
function generateSenderId(): string {
  return `sender_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * BroadcastChannel wrapper with automatic reconnection
 * and error handling
 */
class LoggerChannel {
  private channel: BroadcastChannel | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private senderId: string;
  private isConnected: boolean = false;

  constructor() {
    this.senderId = generateSenderId();
    this.connect();
  }

  /**
   * Connect to the broadcast channel
   */
  private connect(): void {
    // Node also exposes BroadcastChannel; build-time imports must not open one.
    const env = (import.meta as ImportMeta & { env?: { SSR?: boolean } }).env;
    if (env?.SSR || typeof window === 'undefined') return;
    try {
      if (typeof BroadcastChannel === 'undefined') {
        console.warn('[DevLogger] BroadcastChannel not supported');
        return;
      }

      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
        this.handleMessage(event.data);
      };
      this.channel.onmessageerror = () => {
        console.warn('[DevLogger] Channel message error');
      };
      this.isConnected = true;
    } catch (e) {
      console.warn('[DevLogger] Failed to connect to channel:', e);
      this.isConnected = false;
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: ChannelMessage): void {
    // Ignore own messages
    if (message.senderId === this.senderId) {
      return;
    }

    // Notify all handlers
    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch {
        // Silent fail - don't let handler errors break the channel
      }
    }
  }

  /**
   * Send a message to all connected windows/tabs
   */
  send(type: MessageType, payload?: unknown): void {
    try {
      if (!this.channel || !this.isConnected) {
        return;
      }

      const message: ChannelMessage = {
        type,
        payload,
        senderId: this.senderId,
        timestamp: Date.now(),
      };

      this.channel.postMessage(message);
    } catch {
      // Silent fail
    }
  }

  /**
   * Send a new log to all connected windows
   */
  sendLog(log: LogEvent): void {
    this.send('NEW_LOG', log);
  }

  /**
   * Request all logs from main window
   */
  requestSync(): void {
    this.send('SYNC_REQUEST');
  }

  /**
   * Send all logs as sync response
   */
  sendSyncResponse(logs: readonly LogEvent[]): void {
    this.send('SYNC_RESPONSE', logs);
  }

  /**
   * Notify all windows to clear logs
   */
  sendClear(): void {
    this.send('CLEAR_LOGS');
  }

  /**
   * Subscribe to channel messages
   */
  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Check if channel is connected
   */
  isActive(): boolean {
    return this.isConnected;
  }

  /**
   * Get this window's sender ID
   */
  getSenderId(): string {
    return this.senderId;
  }

  /**
   * Close the channel
   */
  close(): void {
    try {
      if (this.channel) {
        this.channel.close();
        this.channel = null;
      }
      this.handlers.clear();
      this.isConnected = false;
    } catch {
      // Silent fail
    }
  }
}

// Singleton instance
export const channel = new LoggerChannel();
