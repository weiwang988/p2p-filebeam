import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const mockPush = vi.fn()
const mockCurrentRoute = { value: { name: 'room' } }

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
    currentRoute: mockCurrentRoute,
  }),
  useRoute: () => ({ params: {} }),
}))

// Capture WebRTC callbacks so tests can simulate DataChannel messages
let capturedCallbacks: any = null
const mockSendTo = vi.fn().mockReturnValue(true)

vi.mock('@/services/SignalingService', () => ({
  SignalingService: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    onDisconnect: vi.fn(() => () => {}),
    disconnect: vi.fn(),
  })),
}))

vi.mock('@/services/WebRTCService', () => ({
  WebRTCService: vi.fn().mockImplementation((callbacks: any) => {
    capturedCallbacks = callbacks
    return {
      getDataChannel: vi.fn(() => ({
        readyState: 'open',
        send: vi.fn(),
        bufferedAmount: 0,
      })),
      createOffer: vi.fn().mockResolvedValue({}),
      handleOffer: vi.fn().mockResolvedValue({}),
      handleAnswer: vi.fn().mockResolvedValue(undefined),
      addIceCandidate: vi.fn().mockResolvedValue(undefined),
      sendTo: mockSendTo,
      disconnect: vi.fn(),
      disconnectAll: vi.fn(),
    }
  }),
}))

vi.mock('naive-ui', () => ({
  useMessage: () => ({
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useApp } from './useApp'

// jsdom Blob does not have arrayBuffer(), polyfill it for tests
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Response(this).arrayBuffer()
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function makePeerPublicKeyBase64(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const raw = await crypto.subtle.exportKey('raw', keyPair.publicKey)
  return arrayBufferToBase64(raw)
}

describe('useApp', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    capturedCallbacks = null
    mockCurrentRoute.value = { name: 'room' }
  })

  describe('sendFiles navigation behavior', () => {
    it('does not navigate to /transfer when sending files', async () => {
      const app = useApp()
      await nextTick()

      app.store.setRoom('ABC123', 'peer_sender')
      app.store.addPeer({
        id: 'peer_receiver',
        displayName: 'Test',
        avatarColor: '#333',
        connectionMode: 'unknown',
        connectionState: 'connected',
      })

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      app.sendFiles([file])
      await nextTick()

      const transferPushes = mockPush.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('/transfer'),
      )
      expect(transferPushes).toHaveLength(0)
    })
  })

  describe('crypto handshake and file transfer', () => {
    it('queues files when crypto is not ready instead of adding to transfer list', async () => {
      const app = useApp()
      await nextTick()

      app.store.setRoom('ABC123', 'peer_self')
      app.store.addPeer({
        id: 'peer_other',
        displayName: 'Other',
        avatarColor: '#444',
        connectionMode: 'unknown',
        connectionState: 'connected',
      })

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      app.sendFiles([file])
      await nextTick()

      // File should NOT appear in transfer list because crypto was not ready
      expect(app.transferStore.transfers).toHaveLength(0)
    })

    it('flushes queued files after receiving crypto_handshake (answerer side)', async () => {
      const app = useApp()
      await nextTick()

      const peerId = 'peer_other'
      app.store.setRoom('ABC123', 'peer_self')
      app.store.addPeer({
        id: peerId,
        displayName: 'Other',
        avatarColor: '#444',
        connectionMode: 'unknown',
        connectionState: 'connected',
      })

      // Queue a file (crypto not ready yet)
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      app.sendFiles([file])
      await nextTick()

      expect(app.transferStore.transfers).toHaveLength(0)

      // Simulate receiving crypto_handshake from the peer (answerer receives offerer's key)
      const peerPublicKey = await makePeerPublicKeyBase64()
      expect(capturedCallbacks).not.toBeNull()
      expect(capturedCallbacks.onMessage).not.toBeNull()

      capturedCallbacks.onMessage(peerId, JSON.stringify({
        type: 'crypto_handshake',
        publicKey: peerPublicKey,
      }))
      // Wait for async handleCryptoHandshake to complete
      await new Promise(r => setTimeout(r, 50))

      // After handshake completes, queued files should be flushed
      expect(app.transferStore.transfers).toHaveLength(1)
      expect(app.transferStore.transfers[0].fileName).toBe('test.txt')
      expect(app.transferStore.transfers[0].direction).toBe('send')
      expect(app.transferStore.transfers[0].peerId).toBe(peerId)
    })

    it('handshake sends only one message per session, no infinite loop', async () => {
      const app = useApp()
      await nextTick()

      const peerId = 'peer_other'
      app.store.setRoom('ABC123', 'peer_self')
      app.store.addPeer({
        id: peerId,
        displayName: 'Other',
        avatarColor: '#444',
        connectionMode: 'unknown',
        connectionState: 'connected',
      })

      // Trigger DataChannel open → starts async handshake
      capturedCallbacks.onDataChannelOpen(peerId)
      // Wait for async startCryptoHandshake to complete
      await new Promise(r => setTimeout(r, 50))

      // Should have sent one crypto_handshake
      const initialSends = mockSendTo.mock.calls.filter(
        (call: any[]) => {
          try {
            return JSON.parse(call[1]).type === 'crypto_handshake'
          } catch { return false }
        },
      )
      expect(initialSends).toHaveLength(1)

      // Peer responds with their public key
      const peerPubKey = await makePeerPublicKeyBase64()
      capturedCallbacks.onMessage(peerId, JSON.stringify({
        type: 'crypto_handshake',
        publicKey: peerPubKey,
      }))
      await new Promise(r => setTimeout(r, 50))

      // No additional crypto_handshake should have been sent (no infinite loop)
      const allSends = mockSendTo.mock.calls.filter(
        (call: any[]) => {
          try {
            return JSON.parse(call[1]).type === 'crypto_handshake'
          } catch { return false }
        },
      )
      expect(allSends).toHaveLength(1)
    })

    it('completes full handshake and flushes queued files', async () => {
      const app = useApp()
      await nextTick()

      const peerId = 'peer_other'
      app.store.setRoom('ABC123', 'peer_self')
      app.store.addPeer({
        id: peerId,
        displayName: 'Other',
        avatarColor: '#444',
        connectionMode: 'unknown',
        connectionState: 'connected',
      })

      // Trigger DataChannel open → starts async handshake
      capturedCallbacks.onDataChannelOpen(peerId)
      await new Promise(r => setTimeout(r, 50))

      // Queue a file before receiving response (crypto not ready yet)
      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      app.sendFiles([file])
      await nextTick()
      expect(app.transferStore.transfers).toHaveLength(0)

      // Peer responds — this completes our handshake
      const peerPubKey = await makePeerPublicKeyBase64()
      capturedCallbacks.onMessage(peerId, JSON.stringify({
        type: 'crypto_handshake',
        publicKey: peerPubKey,
      }))
      await new Promise(r => setTimeout(r, 50))

      // Handshake complete, queued files flushed
      expect(app.transferStore.transfers).toHaveLength(1)
      expect(app.transferStore.transfers[0].fileName).toBe('test.txt')
    })
  })
})
