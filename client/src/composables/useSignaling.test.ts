import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { useSignaling } from './useSignaling'

// Mock SignalingService
let mockSend: ReturnType<typeof vi.fn>
let mockOnMessage: ReturnType<typeof vi.fn>
let mockOnDisconnect: ReturnType<typeof vi.fn>
let mockConnect: ReturnType<typeof vi.fn>
let mockDisconnect: ReturnType<typeof vi.fn>
let mockIsConnected: boolean

vi.mock('@/services/SignalingService', () => ({
  SignalingService: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    send: mockSend,
    onMessage: mockOnMessage,
    onDisconnect: mockOnDisconnect,
    disconnect: mockDisconnect,
    get isConnected() { return mockIsConnected },
  })),
}))

describe('useSignaling', () => {
  let messageHandler: (msg: any) => void
  let disconnectHandler: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    mockSend = vi.fn()
    mockConnect = vi.fn().mockResolvedValue(undefined)
    mockDisconnect = vi.fn()
    mockIsConnected = false

    mockOnMessage = vi.fn((handler: any) => {
      messageHandler = handler
      return () => {}
    })
    mockOnDisconnect = vi.fn((handler: any) => {
      disconnectHandler = handler
      return () => {}
    })
  })

  it('returns reactive connection state', () => {
    const { isConnected } = useSignaling('ws://localhost:3001')
    expect(isConnected.value).toBe(false)
  })

  it('calls connect on the signaling service', () => {
    useSignaling('ws://localhost:3001')
    expect(mockConnect).toHaveBeenCalled()
  })

  it('updates isConnected after successful connection', async () => {
    mockIsConnected = true
    const { isConnected } = useSignaling('ws://localhost:3001')
    await nextTick()
    expect(isConnected.value).toBe(true)
  })

  it('send method delegates to the signaling service', () => {
    const { send } = useSignaling('ws://localhost:3001')
    send({ type: 'create_room', displayName: 'Alice', avatarColor: '#333' })
    expect(mockSend).toHaveBeenCalledWith({ type: 'create_room', displayName: 'Alice', avatarColor: '#333' })
  })

  it('disconnect cleans up the signaling service', () => {
    const { disconnect } = useSignaling('ws://localhost:3001')
    disconnect()
    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('calls onRoomCreated callback when room_created message arrives', () => {
    const onRoomCreated = vi.fn()
    useSignaling('ws://localhost:3001', { onRoomCreated })

    messageHandler({ type: 'room_created', roomCode: 'ABC123', peerId: 'peer1', peerName: 'Alice', avatarColor: '#333' })
    expect(onRoomCreated).toHaveBeenCalledWith({ roomCode: 'ABC123', peerId: 'peer1', peerName: 'Alice', avatarColor: '#333' })
  })

  it('calls onRoomJoined callback when room_joined message arrives', () => {
    const onRoomJoined = vi.fn()
    useSignaling('ws://localhost:3001', { onRoomJoined })

    messageHandler({ type: 'room_joined', roomCode: 'ABC123', peerId: 'peer2', peerName: 'Bob', avatarColor: '#444', peers: [{ peerId: 'peer1', displayName: 'Alice', avatarColor: '#333' }] })
    expect(onRoomJoined).toHaveBeenCalledWith({
      roomCode: 'ABC123',
      peerId: 'peer2',
      peerName: 'Bob',
      avatarColor: '#444',
      peers: [{ peerId: 'peer1', displayName: 'Alice', avatarColor: '#333' }],
    })
  })

  it('calls onRoomError callback when room_error message arrives', () => {
    const onRoomError = vi.fn()
    useSignaling('ws://localhost:3001', { onRoomError })

    messageHandler({ type: 'room_error', code: 'ROOM_NOT_FOUND', message: 'Not found' })
    expect(onRoomError).toHaveBeenCalledWith({ code: 'ROOM_NOT_FOUND', message: 'Not found' })
  })

  it('calls onPeerJoined callback', () => {
    const onPeerJoined = vi.fn()
    useSignaling('ws://localhost:3001', { onPeerJoined })

    messageHandler({ type: 'peer_joined', peerId: 'peer2', displayName: 'Bob', avatarColor: '#444' })
    expect(onPeerJoined).toHaveBeenCalledWith({ peerId: 'peer2', displayName: 'Bob', avatarColor: '#444' })
  })

  it('calls onPeerLeft callback', () => {
    const onPeerLeft = vi.fn()
    useSignaling('ws://localhost:3001', { onPeerLeft })

    messageHandler({ type: 'peer_left', peerId: 'peer2' })
    expect(onPeerLeft).toHaveBeenCalledWith({ peerId: 'peer2' })
  })

  it('calls onSdpOffer callback for relayed offers', () => {
    const onSdpOffer = vi.fn()
    useSignaling('ws://localhost:3001', { onSdpOffer })

    messageHandler({
      type: 'sdp_offer',
      from: 'peer2',
      sdp: { sdp: 'mock-sdp', type: 'offer' },
    })
    expect(onSdpOffer).toHaveBeenCalledWith({ from: 'peer2', sdp: { sdp: 'mock-sdp', type: 'offer' } })
  })

  it('calls onSdpAnswer callback for relayed answers', () => {
    const onSdpAnswer = vi.fn()
    useSignaling('ws://localhost:3001', { onSdpAnswer })

    messageHandler({
      type: 'sdp_answer',
      from: 'peer2',
      sdp: { sdp: 'mock-sdp', type: 'answer' },
    })
    expect(onSdpAnswer).toHaveBeenCalledWith({ from: 'peer2', sdp: { sdp: 'mock-sdp', type: 'answer' } })
  })

  it('calls onIceCandidate callback', () => {
    const onIceCandidate = vi.fn()
    useSignaling('ws://localhost:3001', { onIceCandidate })

    messageHandler({
      type: 'ice_candidate',
      from: 'peer2',
      candidate: { candidate: 'cand', sdpMid: '0', sdpMLineIndex: 0 },
    })
    expect(onIceCandidate).toHaveBeenCalledWith({
      from: 'peer2',
      candidate: { candidate: 'cand', sdpMid: '0', sdpMLineIndex: 0 },
    })
  })

  it('calls onDisconnect callback', () => {
    const onDisconnect = vi.fn()
    useSignaling('ws://localhost:3001', { onDisconnect })

    disconnectHandler()
    expect(onDisconnect).toHaveBeenCalled()
  })
})
