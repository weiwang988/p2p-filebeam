import type { ClientMessage, ServerMessage, SignalingCallback } from '@/types/signaling'

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY = 2000

export class SignalingService {
  private ws: WebSocket | null = null
  private url: string
  private messageHandlers: Set<SignalingCallback> = new Set()
  private disconnectHandlers: Set<() => void> = new Set()
  private reconnectAttempts = 0
  private intentionalClose = false

  constructor(url: string) {
    this.url = url
  }

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve()

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        this.reconnectAttempts = 0
        resolve()
      }

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message: ServerMessage = JSON.parse(event.data as string)
          for (const handler of this.messageHandlers) {
            handler(message)
          }
        } catch {
          // Ignore malformed messages
        }
      }

      this.ws.onclose = (event: CloseEvent) => {
        for (const handler of this.disconnectHandlers) {
          handler()
        }
        if (!this.intentionalClose && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++
          const delay = RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1)
          setTimeout(() => {
            if (!this.intentionalClose) {
              this.connect().catch(() => {})
            }
          }, delay)
        }
      }

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'))
      }
    })
  }

  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }
    this.ws.send(JSON.stringify(message))
  }

  onMessage(handler: SignalingCallback): () => void {
    this.messageHandlers.add(handler)
    return () => {
      this.messageHandlers.delete(handler)
    }
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.add(handler)
    return () => {
      this.disconnectHandlers.delete(handler)
    }
  }

  disconnect(): void {
    this.intentionalClose = true
    this.ws?.close(1000)
    this.ws = null
    this.messageHandlers.clear()
    this.disconnectHandlers.clear()
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
