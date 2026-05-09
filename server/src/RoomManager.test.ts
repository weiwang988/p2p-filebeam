import { describe, it, expect, beforeEach } from 'vitest'
import { RoomManager } from './RoomManager'
import type { PeerInfo } from './types'

function makePeer(id: string): PeerInfo {
  return { id, joinedAt: Date.now(), displayName: '', avatarColor: '', send: () => {} }
}

describe('RoomManager', () => {
  let manager: RoomManager

  beforeEach(() => {
    manager = new RoomManager()
  })

  describe('createRoom', () => {
    it('creates a room with a 6-char uppercase alphanumeric code', () => {
      const room = manager.createRoom('peer1')
      expect(room.code).toMatch(/^[A-Z0-9]{6}$/)
    })

    it('adds the creator as the first peer', () => {
      const room = manager.createRoom('peer1')
      expect(room.peers.size).toBe(1)
      expect(room.peers.has('peer1')).toBe(true)
    })

    it('generates unique room codes across multiple calls', () => {
      const codes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        const room = manager.createRoom(`peer${i}`)
        codes.add(room.code)
      }
      // All codes should be unique (with 6 chars A-Z0-9, 100 is safe)
      expect(codes.size).toBe(100)
    })

    it('sets createdAt timestamp', () => {
      const before = Date.now()
      const room = manager.createRoom('peer1')
      expect(room.createdAt).toBeGreaterThanOrEqual(before)
    })
  })

  describe('joinRoom', () => {
    it('lets a peer join an existing room', () => {
      const room = manager.createRoom('peer1')
      const result = manager.joinRoom(room.code, makePeer('peer2'))

      expect(result.joined).toBe(true)
      expect(result.peers).toContain('peer1')
    })

    it('returns error for non-existent room', () => {
      const result = manager.joinRoom('ZZZZZZ', makePeer('peer2'))
      expect(result.joined).toBe(false)
      expect(result.error).toBe('ROOM_NOT_FOUND')
    })

    it('returns error when room is full (10 peers max)', () => {
      const room = manager.createRoom('creator')
      // Add 9 more to reach 10
      for (let i = 1; i < 10; i++) {
        const result = manager.joinRoom(room.code, makePeer(`peer${i}`))
        expect(result.joined).toBe(true)
      }
      // 11th should fail
      const result = manager.joinRoom(room.code, makePeer('peer11'))
      expect(result.joined).toBe(false)
      expect(result.error).toBe('ROOM_FULL')
    })

    it('adds the new peer to the room on success', () => {
      const room = manager.createRoom('creator')
      manager.joinRoom(room.code, makePeer('newPeer'))
      expect(room.peers.has('newPeer')).toBe(true)
      expect(room.peers.size).toBe(2)
    })
  })

  describe('leaveRoom', () => {
    it('removes peer from room', () => {
      const room = manager.createRoom('creator')
      manager.joinRoom(room.code, makePeer('peer2'))
      const result = manager.leaveRoom(room.code, 'peer2')
      expect(result.removed).toBe(true)
      expect(room.peers.has('peer2')).toBe(false)
      expect(result.remainingPeers).toEqual(['creator'])
    })

    it('returns remaining peers after leave', () => {
      const room = manager.createRoom('creator')
      manager.joinRoom(room.code, makePeer('peer2'))
      manager.joinRoom(room.code, makePeer('peer3'))
      const result = manager.leaveRoom(room.code, 'peer2')
      expect(result.remainingPeers).toHaveLength(2)
      expect(result.remainingPeers).toContain('creator')
      expect(result.remainingPeers).toContain('peer3')
    })

    it('returns deleted=true and deletes room when last peer leaves', () => {
      const room = manager.createRoom('creator')
      const result = manager.leaveRoom(room.code, 'creator')
      expect(result.removed).toBe(true)
      expect(result.deleted).toBe(true)
      expect(manager.getRoom(room.code)).toBeUndefined()
    })

    it('returns notFound for non-existent room', () => {
      const result = manager.leaveRoom('NOSUCH', 'peer1')
      expect(result.removed).toBe(false)
      expect(result.error).toBe('ROOM_NOT_FOUND')
    })

    it('returns notFound for non-existent peer in room', () => {
      const room = manager.createRoom('creator')
      const result = manager.leaveRoom(room.code, 'stranger')
      expect(result.removed).toBe(false)
      expect(result.error).toBe('PEER_NOT_FOUND')
    })
  })

  describe('getRoom', () => {
    it('returns room by code', () => {
      const room = manager.createRoom('peer1')
      expect(manager.getRoom(room.code)).toBe(room)
    })

    it('returns undefined for non-existent code', () => {
      expect(manager.getRoom('NOSUCH')).toBeUndefined()
    })
  })

  describe('getPeerIds', () => {
    it('returns all peer IDs in the room', () => {
      const room = manager.createRoom('creator')
      manager.joinRoom(room.code, makePeer('peer2'))

      const ids = manager.getPeerIds(room.code)
      expect(ids).toHaveLength(2)
      expect(ids).toContain('creator')
      expect(ids).toContain('peer2')
    })

    it('returns empty array for non-existent room', () => {
      expect(manager.getPeerIds('NOSUCH')).toEqual([])
    })
  })

  describe('cleanStaleRooms', () => {
    it('removes rooms older than specified TTL', () => {
      const room = manager.createRoom('peer1')
      // Fake the createdAt time to be in the past
      room.createdAt = Date.now() - 3600_000 // 1 hour ago

      manager.cleanStaleRooms(1800_000) // 30 min TTL
      expect(manager.getRoom(room.code)).toBeUndefined()
    })

    it('keeps fresh rooms', () => {
      const room = manager.createRoom('peer1')
      manager.cleanStaleRooms(1800_000)
      expect(manager.getRoom(room.code)).toBe(room)
    })
  })
})
