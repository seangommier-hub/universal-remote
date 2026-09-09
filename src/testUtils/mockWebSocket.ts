// Minimal WebSocket test double shared by driver tests that talk over a real WebSocket
// (Samsung, LG). Mimics just the slice of the real WebSocket API this codebase uses
// (onopen/onmessage/onerror/send/close/readyState).
export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly CONNECTING = MockWebSocket.CONNECTING;
  readonly OPEN = MockWebSocket.OPEN;
  readonly CLOSED = MockWebSocket.CLOSED;

  readyState = MockWebSocket.OPEN;
  sentMessages: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateOpen(): void {
    this.onopen?.();
  }

  simulateMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  simulateRawMessage(data: string): void {
    this.onmessage?.({ data });
  }

  simulateError(): void {
    this.onerror?.();
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }

  static latest(): MockWebSocket {
    const instance = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    if (!instance) throw new Error("No MockWebSocket instance created yet");
    return instance;
  }

  static at(index: number): MockWebSocket {
    const instance = MockWebSocket.instances[index];
    if (!instance) throw new Error(`No MockWebSocket instance at index ${index}`);
    return instance;
  }
}

export function installMockWebSocket(): void {
  MockWebSocket.reset();
  (global as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
}

/** Drains pending microtasks — needed after simulateOpen()/simulateMessage() when the code under test has its own internal await chain (e.g. openSocketWithRelayFallback) between the event firing and its visible side effect. */
export async function flushMicrotasks(ticks = 4): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}
