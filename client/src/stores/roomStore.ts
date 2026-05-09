import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Peer, RoomState } from '@/types/room'

export const useRoomStore = defineStore('room', () => {
  const roomCode = ref<string | null>(null)
  const peerId = ref<string | null>(null)
  const peers = ref<Peer[]>([])
  const roomState = ref<RoomState>('idle')
  const error = ref<string | null>(null)
  const localDisplayName = ref('')
  const localAvatarColor = ref('')

  const peerCount = computed(() => peers.value.length)
  const hasPeers = computed(() => peers.value.length > 0)

  const selfPeer = computed<Peer | null>(() => {
    if (!peerId.value) return null
    return {
      id: peerId.value,
      displayName: localDisplayName.value,
      avatarColor: localAvatarColor.value,
      connectionMode: 'lan',
      connectionState: 'connected',
    }
  })

  const peerList = computed<Peer[]>(() => {
    const list: Peer[] = []
    if (selfPeer.value) {
      list.push(selfPeer.value)
    }
    list.push(...peers.value)
    return list
  })

  function setRoom(code: string, pid: string) {
    roomCode.value = code
    peerId.value = pid
    roomState.value = 'connected'
    error.value = null
  }

  function addPeer(peer: Peer) {
    if (!peers.value.find(p => p.id === peer.id)) {
      peers.value.push(peer)
    }
  }

  function removePeer(peerId_2: string) {
    peers.value = peers.value.filter(p => p.id !== peerId_2)
  }

  function updatePeerConnection(peerId_2: string, updates: Partial<Peer>) {
    const peer = peers.value.find(p => p.id === peerId_2)
    if (peer) {
      Object.assign(peer, updates)
    }
  }

  function setError(err: string) {
    error.value = err
    roomState.value = 'idle'
  }

  function setRoomState(state: RoomState) {
    roomState.value = state
  }

  function reset() {
    roomCode.value = null
    peerId.value = null
    peers.value = []
    roomState.value = 'idle'
    error.value = null
    localDisplayName.value = ''
    localAvatarColor.value = ''
  }

  return {
    roomCode,
    peerId,
    peers,
    roomState,
    error,
    localDisplayName,
    localAvatarColor,
    peerCount,
    hasPeers,
    selfPeer,
    peerList,
    setRoom,
    addPeer,
    removePeer,
    updatePeerConnection,
    setError,
    setRoomState,
    reset,
  }
})
