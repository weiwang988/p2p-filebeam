import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRoomStore } from './roomStore'

describe('roomStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initial state', () => {
    it('has null roomCode and peerId', () => {
      const store = useRoomStore()
      expect(store.roomCode).toBeNull()
      expect(store.peerId).toBeNull()
    })

    it('has empty peers array', () => {
      const store = useRoomStore()
      expect(store.peers).toEqual([])
      expect(store.peerCount).toBe(0)
      expect(store.hasPeers).toBe(false)
    })

    it('has idle roomState', () => {
      const store = useRoomStore()
      expect(store.roomState).toBe('idle')
    })
  })

  describe('setRoom', () => {
    it('sets roomCode, peerId and transitions to connected', () => {
      const store = useRoomStore()
      store.setRoom('ABC123', 'peer1')
      expect(store.roomCode).toBe('ABC123')
      expect(store.peerId).toBe('peer1')
      expect(store.roomState).toBe('connected')
      expect(store.error).toBeNull()
    })

    it('clears any existing error', () => {
      const store = useRoomStore()
      store.setError('some error')
      store.setRoom('ABC123', 'peer1')
      expect(store.error).toBeNull()
    })
  })

  describe('addPeer', () => {
    it('adds a peer to the list', () => {
      const store = useRoomStore()
      store.addPeer({ id: 'peer2', connectionMode: 'unknown', connectionState: 'connecting', displayName: 'Test', avatarColor: '#333' })
      expect(store.peers).toHaveLength(1)
      expect(store.peers[0].id).toBe('peer2')
    })

    it('does not add duplicate peers', () => {
      const store = useRoomStore()
      const peer = { id: 'peer2', connectionMode: 'unknown' as const, connectionState: 'connecting' as const, displayName: 'Test', avatarColor: '#333' }
      store.addPeer(peer)
      store.addPeer(peer)
      expect(store.peers).toHaveLength(1)
    })

    it('updates hasPeers and peerCount reactively', () => {
      const store = useRoomStore()
      expect(store.hasPeers).toBe(false)
      store.addPeer({ id: 'peer2', connectionMode: 'unknown' as const, connectionState: 'connected' as const, displayName: 'Test', avatarColor: '#333' })
      expect(store.hasPeers).toBe(true)
      expect(store.peerCount).toBe(1)
    })
  })

  describe('removePeer', () => {
    it('removes a peer by id', () => {
      const store = useRoomStore()
      store.addPeer({ id: 'peer2', connectionMode: 'lan', connectionState: 'connected', displayName: 'Test', avatarColor: '#333' })
      store.addPeer({ id: 'peer3', connectionMode: 'turn', connectionState: 'connected', displayName: 'Test', avatarColor: '#333' })
      store.removePeer('peer2')
      expect(store.peers).toHaveLength(1)
      expect(store.peers[0].id).toBe('peer3')
    })

    it('does nothing when peer not found', () => {
      const store = useRoomStore()
      store.addPeer({ id: 'peer2', connectionMode: 'lan', connectionState: 'connected', displayName: 'Test', avatarColor: '#333' })
      store.removePeer('nonexistent')
      expect(store.peers).toHaveLength(1)
    })
  })

  describe('updatePeerConnection', () => {
    it('updates peer connection mode and state', () => {
      const store = useRoomStore()
      store.addPeer({ id: 'peer2', connectionMode: 'unknown', connectionState: 'connecting', displayName: 'Test', avatarColor: '#333' })
      store.updatePeerConnection('peer2', { connectionMode: 'lan', connectionState: 'connected', displayName: 'Test', avatarColor: '#333' })
      expect(store.peers[0].connectionMode).toBe('lan')
      expect(store.peers[0].connectionState).toBe('connected')
    })
  })

  describe('setError', () => {
    it('sets error message and resets room state', () => {
      const store = useRoomStore()
      store.setRoomState('joining')
      store.setError('Room not found')
      expect(store.error).toBe('Room not found')
      expect(store.roomState).toBe('idle')
    })
  })

  describe('reset', () => {
    it('clears all state back to defaults', () => {
      const store = useRoomStore()
      store.setRoom('ABC123', 'peer1')
      store.addPeer({ id: 'peer2', connectionMode: 'lan', connectionState: 'connected', displayName: 'Test', avatarColor: '#333' })
      store.reset()

      expect(store.roomCode).toBeNull()
      expect(store.peerId).toBeNull()
      expect(store.peers).toEqual([])
      expect(store.roomState).toBe('idle')
      expect(store.error).toBeNull()
    })
  })
})
