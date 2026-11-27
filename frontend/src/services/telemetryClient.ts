/**
 * @file telemetryClient.ts
 * Transport layer between the dashboard and the C++ backend (WebSocket / IPC).
 * The dashboard depends only on the `TelemetryClient` interface so tests can inject a fake.
 */

/** A live telemetry frame pushed by the backend. */
export interface TelemetryMessage {
  packetCount: number;
  bandwidthMbps: number;
  rollingMbps?: number;
  activeConnections: number;
  /** Optional capture state reported by the backend. */
  captureState?: 'RUNNING' | 'PAUSED';
}

/** Control signals the UI can send to toggle the backend sniffing state. */
export type CaptureCommand = 'start_capture' | 'stop_capture';

/** Contract used by the dashboard to talk to the backend. */
export interface TelemetryClient {
  /** Subscribes to telemetry and connection status; returns an unsubscribe function. */
  subscribe(
    onMessage: (message: TelemetryMessage) => void,
    onStatus: (connected: boolean) => void,
  ): () => void;
  /** Sends a control signal; rejects if the backend cannot be reached. */
  sendControl(command: CaptureCommand): Promise<void>;
}

const DEFAULT_URL = 'ws://localhost:8080';

/** Creates a WebSocket-backed client. The backend URL is a planned default and may change. */
export function createWebSocketClient(url: string = DEFAULT_URL): TelemetryClient {
  let socket: WebSocket | null = null;
  return {
    subscribe(onMessage, onStatus) {
      const ws = new WebSocket(url);
      socket = ws;
      ws.onopen = () => onStatus(true);
      ws.onclose = () => onStatus(false);
      ws.onerror = () => onStatus(false);
      ws.onmessage = (event) => {
        try {
          onMessage(JSON.parse(String(event.data)) as TelemetryMessage);
        } catch {
          /* ignore malformed frames */
        }
      };
      return () => {
        ws.onclose = null;
        ws.close();
        if (socket === ws) socket = null;
      };
    },
    async sendControl(command) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('Backend is not connected');
      }
      socket.send(JSON.stringify({ type: 'control', command }));
    },
  };
}
