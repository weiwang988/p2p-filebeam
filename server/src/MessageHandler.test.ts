import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MessageHandler } from './MessageHandler'
import { RoomManager } from './RoomManager'
import type { PeerInfo } from './types'

function makePeer(id: string): PeerInfo {
  return {
    id,
    joinedAt: Date.now(),
    displayName: '',
    avatarColor: '',
    send: vi.fn(),
  }
}

describe('MessageHandler', () => {
  let handler: MessageHandler
  let roomManager: RoomManager
  let peer: PeerInfo

  beforeEach(() => {
    roomManager = new RoomManager()
    handler = new MessageHandler(roomManager)
    peer = makePeer('peer1')
  })

  describe('handleMessage', () => {
    describe('create_room', () => {
      it('creates a room and sends room_created response', () => {
        const result = handler.handleMessage(peer, { type: 'create_room', displayName: 'Alice', avatarColor: '#333' })

        expect(result.handled).toBe(true)
        expect(peer.send).toHaveBeenCalledTimes(1)
        const sentData = JSON.parse((peer.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(sentData.type).toBe('room_created')
        expect(sentData.roomCode).toMatch(/^[A-Z0-9]{6}$/)
        expect(sentData.peerId).toBe('peer1')
        expect(sentData.peerName).toBe('Alice')
        expect(sentData.avatarColor).toBe('#333')
      })

      it('stores the peer with an updated send function in the room', () => {
        handler.handleMessage(peer, { type: 'create_room', displayName: 'Alice', avatarColor: '#333' })
        const sentData = JSON.parse((peer.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        const room = roomManager.getRoom(sentData.roomCode)
        expect(room).toBeDefined()
        expect(room!.peers.get('peer1')!.send).toBeDefined()
      })
    })

    describe('join_room', () => {
      it('joins existing room and sends room_joined', () => {
        // First create a room
        const room = roomManager.createRoom('hostPeer')
        // Override the host's send function
        const hostSend = vi.fn()
        room.peers.set('hostPeer', { id: 'hostPeer', joinedAt: Date.now(), displayName: 'Host', avatarColor: '#111', send: hostSend })

        const result = handler.handleMessage(peer, { type: 'join_room', roomCode: room.code, displayName: 'Bob', avatarColor: '#444' })

        expect(result.handled).toBe(true)
        expect(peer.send).toHaveBeenCalled()
        const sentData = JSON.parse((peer.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(sentData.type).toBe('room_joined')
        expect(sentData.roomCode).toBe(room.code)
        expect(sentData.peerName).toBe('Bob')
        expect(sentData.avatarColor).toBe('#444')
        expect(sentData.peers).toEqual([{ peerId: 'hostPeer', displayName: 'Host', avatarColor: '#111' }])
      })

      it('broadcasts peer_joined to existing peers', () => {
        const room = roomManager.createRoom('hostPeer')
        const hostSend = vi.fn()
        room.peers.set('hostPeer', { id: 'hostPeer', joinedAt: Date.now(), displayName: 'Host', avatarColor: '#111', send: hostSend })

        handler.handleMessage(peer, { type: 'join_room', roomCode: room.code, displayName: 'Bob', avatarColor: '#444' })

        expect(hostSend).toHaveBeenCalled()
        const broadcast = JSON.parse(hostSend.mock.calls[0][0])
        expect(broadcast.type).toBe('peer_joined')
        expect(broadcast.peerId).toBe('peer1')
        expect(broadcast.displayName).toBe('Bob')
        expect(broadcast.avatarColor).toBe('#444')
      })

      it('sends room_error for non-existent room', () => {
        const result = handler.handleMessage(peer, { type: 'join_room', roomCode: 'ZZZZZZ', displayName: 'Bob', avatarColor: '#444' })

        expect(result.handled).toBe(true)
        const sentData = JSON.parse((peer.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(sentData.type).toBe('room_error')
        expect(sentData.code).toBe('ROOM_NOT_FOUND')
      })

      it('sends room_error for invalid room code format', () => {
        handler.handleMessage(peer, { type: 'join_room', roomCode: '!!!', displayName: 'Bob', avatarColor: '#444' })

        const sentData = JSON.parse((peer.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(sentData.type).toBe('room_error')
        expect(sentData.code).toBe('INVALID_CODE')
      })

      it('sends room_error for full room', () => {
        const room = roomManager.createRoom('hostPeer')
        const hostSend = vi.fn()
        room.peers.set('hostPeer', { id: 'hostPeer', joinedAt: Date.now(), displayName: 'Host', avatarColor: '#111', send: hostSend })

        // Fill the room to 10 peers
        for (let i = 0; i < 9; i++) {
          room.peers.set(`peer${i}`, makePeer(`peer${i}`))
        }

        handler.handleMessage(peer, { type: 'join_room', roomCode: room.code, displayName: 'Bob', avatarColor: '#444' })

        const sentData = JSON.parse((peer.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(sentData.type).toBe('room_error')
        expect(sentData.code).toBe('ROOM_FULL')
      })
    })

    describe('sdp_offer', () => {
      it('relays sdp_offer to the target peer with from field', () => {
        const room = roomManager.createRoom('peer1')
        room.peers.set('peer1', peer)
        const peer2 = makePeer('peer2')
        room.peers.set('peer2', peer2)

        handler.handleMessage(peer, {
          type: 'sdp_offer',
          target: 'peer2',
          sdp: { sdp: 'mock-sdp', type: 'offer' },
        })

        expect(peer2.send).toHaveBeenCalled()
        const relayed = JSON.parse((peer2.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(relayed.type).toBe('sdp_offer')
        expect(relayed.from).toBe('peer1')
        expect(relayed.sdp).toEqual({ sdp: 'mock-sdp', type: 'offer' })
      })
    })

    describe('sdp_answer', () => {
      it('relays sdp_answer to the target peer', () => {
        const room = roomManager.createRoom('peer1')
        room.peers.set('peer1', peer)
        const peer2 = makePeer('peer2')
        room.peers.set('peer2', peer2)

        handler.handleMessage(peer, {
          type: 'sdp_answer',
          target: 'peer2',
          sdp: { sdp: 'mock-answer-sdp', type: 'answer' },
        })

        const relayed = JSON.parse((peer2.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(relayed.type).toBe('sdp_answer')
        expect(relayed.from).toBe('peer1')
        expect(relayed.sdp).toEqual({ sdp: 'mock-answer-sdp', type: 'answer' })
      })
    })

    describe('ice_candidate', () => {
      it('relays ice_candidate to the target peer', () => {
        const room = roomManager.createRoom('peer1')
        room.peers.set('peer1', peer)
        const peer2 = makePeer('peer2')
        room.peers.set('peer2', peer2)

        handler.handleMessage(peer, {
          type: 'ice_candidate',
          target: 'peer2',
          candidate: { candidate: 'mock-candidate', sdpMid: '0', sdpMLineIndex: 0 },
        })

        const relayed = JSON.parse((peer2.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(relayed.type).toBe('ice_candidate')
        expect(relayed.from).toBe('peer1')
        expect(relayed.candidate).toEqual({ candidate: 'mock-candidate', sdpMid: '0', sdpMLineIndex: 0 })
      })
    })

    describe('leave_room', () => {
      it('removes peer and broadcasts peer_left to remaining peers', () => {
        const room = roomManager.createRoom('hostPeer')
        const hostSend = vi.fn()
        room.peers.set('hostPeer', { id: 'hostPeer', joinedAt: Date.now(), displayName: 'Host', avatarColor: '#111', send: hostSend })
        const peer2 = makePeer('peer2')
        room.peers.set('peer2', peer2)

        handler.handleMessage(peer2, { type: 'leave_room' })

        // peer2 was removed
        expect(room.peers.has('peer2')).toBe(false)
        // hostPeer should receive peer_left
        expect(hostSend).toHaveBeenCalled()
        const broadcast = JSON.parse(hostSend.mock.calls[0][0])
        expect(broadcast.type).toBe('peer_left')
        expect(broadcast.peerId).toBe('peer2')
      })
    })

    describe('connection_mode', () => {
      it('relays connection_mode to the target peer', () => {
        const room = roomManager.createRoom('peer1')
        room.peers.set('peer1', peer)
        const peer2 = makePeer('peer2')
        room.peers.set('peer2', peer2)

        handler.handleMessage(peer, {
          type: 'connection_mode',
          target: 'peer2',
          mode: 'lan',
        })

        const relayed = JSON.parse((peer2.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(relayed.type).toBe('connection_mode')
        expect(relayed.from).toBe('peer1')
        expect(relayed.mode).toBe('lan')
      })
    })

    describe('ping', () => {
      it('responds with pong', () => {
        handler.handleMessage(peer, { type: 'ping' })

        const sentData = JSON.parse((peer.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(sentData.type).toBe('pong')
      })
    })

    describe('unknown message type', () => {
      it('returns handled=false for unknown types', () => {
        const result = handler.handleMessage(peer, { type: 'bogus_message' } as any)
        expect(result.handled).toBe(false)
      })
    })
  })
})
