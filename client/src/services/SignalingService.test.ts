import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SignalingService } from './SignalingService'

function createMockWs() {
  return {
    readyState: 0,
    onopen: null as (() => void) | null,
    onmessage: null as ((e: { data: string }) => void) | null,
    onclose: null as ((e: { code: number }) => void) | null,
    onerror: null as (() => void) | null,
    sent: [] as string[],
    send(data: string) { this.sent.push(data) },
    close(code?: number) {
      this.readyState = 3
      this.onclose?.({ code: code ?? 1000 })
    },
  }
}

describe('SignalingService', () => {
  let mockWs: ReturnType<typeof createMockWs>
  let service: SignalingService
  let WebSocketCalls: ReturnType<typeof createMockWs>[]

  beforeEach(() => {
    mockWs = createMockWs()
    WebSocketCalls = []
    ;(globalThis as any).WebSocket = function (url: string) {
      WebSocketCalls.push(mockWs)
      return mockWs
    }
    ;(globalThis as any).WebSocket.OPEN = 1
    service = new SignalingService('ws://localhost:3001')
  })

  describe('connect', () => {
    it('creates a WebSocket and resolves on open', async () => {
      const promise = service.connect()
      expect(WebSocketCalls).toHaveLength(1)
      mockWs.readyState = 1
      mockWs.onopen?.()
      await expect(promise).resolves.toBeUndefined()
    })

    it('rejects when the connection errors', async () => {
      const promise = service.connect()
      mockWs.onerror?.()
      await expect(promise).rejects.toThrow('WebSocket connection failed')
    })

    it('does not create a new connection when already open', () => {
      service.connect()
      mockWs.readyState = 1
      mockWs.onopen?.()
      service.connect()
      expect(WebSocketCalls).toHaveLength(1)
    })
  })

  describe('send', () => {
    it('sends a JSON-encoded message', async () => {
      const promise = service.connect()
      mockWs.readyState = 1
      mockWs.onopen?.()
      await promise

      service.send({ type: 'create_room', displayName: 'Alice', avatarColor: '#333' })
      expect(mockWs.sent).toHaveLength(1)
      const parsed = JSON.parse(mockWs.sent[0])
      expect(parsed.type).toBe('create_room')
    })

    it('throws if not connected', () => {
      expect(() => service.send({ type: 'create_room', displayName: 'Alice', avatarColor: '#333' })).toThrow('Not connected')
    })
  })

  describe('onMessage', () => {
    it('registers a callback and receives incoming messages', async () => {
      const promise = service.connect()
      mockWs.readyState = 1
      mockWs.onopen?.()
      await promise

      const handler = vi.fn()
      service.onMessage(handler)

      mockWs.onmessage?.({ data: JSON.stringify({ type: 'room_created', roomCode: 'ABC123', peerId: 'peer1' }) })

      expect(handler).toHaveBeenCalledWith({
        type: 'room_created',
        roomCode: 'ABC123',
        peerId: 'peer1',
      })
    })

    it('supports multiple message handlers', async () => {
      const promise = service.connect()
      mockWs.readyState = 1
      mockWs.onopen?.()
      await promise

      const handler1 = vi.fn()
      const handler2 = vi.fn()
      service.onMessage(handler1)
      service.onMessage(handler2)

      mockWs.onmessage?.({ data: JSON.stringify({ type: 'peer_joined', peerId: 'peer2' }) })

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('allows removing a message handler', async () => {
      const promise = service.connect()
      mockWs.readyState = 1
      mockWs.onopen?.()
      await promise

      const handler = vi.fn()
      const unsub = service.onMessage(handler)
      unsub()

      mockWs.onmessage?.({ data: JSON.stringify({ type: 'pong' }) })
      expect(handler).not.toHaveBeenCalled()
    })

    it('ignores malformed JSON messages', async () => {
      const promise = service.connect()
      mockWs.readyState = 1
      mockWs.onopen?.()
      await promise

      const handler = vi.fn()
      service.onMessage(handler)

      mockWs.onmessage?.({ data: 'not json' })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('disconnect', () => {
    it('closes the WebSocket and resets state', async () => {
      const promise = service.connect()
      mockWs.readyState = 1
      mockWs.onopen?.()
      await promise

      service.disconnect()
      expect(mockWs.readyState).toBe(3)
      expect(() => service.send({ type: 'ping' })).toThrow('Not connected')
    })
  })

  describe('reconnect', () => {
    it('calls onDisconnect handlers on unexpected close', async () => {
      const promise = service.connect()
      mockWs.readyState = 1
      mockWs.onopen?.()
      await promise

      const closeHandler = vi.fn()
      service.onDisconnect(closeHandler)

      mockWs.onclose?.({ code: 1006 })
      expect(closeHandler).toHaveBeenCalled()
    })

    it('does not reconnect on intentional close', async () => {
      const promise = service.connect()
      mockWs.readyState = 1
      mockWs.onopen?.()
      await promise

      service.disconnect()
      // After intentional disconnect, the service should not be connected
      expect(service.isConnected).toBe(false)
    })
  })
})
