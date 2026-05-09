import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRoomStore } from '@/stores/roomStore'
import type { SignalingCallbacks } from './useSignaling'

export function useRoom(getSignaling: () => {
  send: (msg: any) => void
  isConnected: { value: boolean }
} | null) {
  const router = useRouter()
  const store = useRoomStore()

  function buildCallbacks(): SignalingCallbacks {
    return {
      onRoomCreated({ roomCode, peerId, peerName, avatarColor }) {
        store.setRoom(roomCode, peerId)
        store.localDisplayName = peerName
        store.localAvatarColor = avatarColor
        router.push(`/room/${roomCode}`)
      },
      onRoomJoined({ roomCode, peerId, peerName, avatarColor, peers }) {
        store.setRoom(roomCode, peerId)
        store.localDisplayName = peerName
        store.localAvatarColor = avatarColor
        for (const p of peers) {
          store.addPeer({ id: p.peerId, displayName: p.displayName, avatarColor: p.avatarColor, connectionMode: 'unknown', connectionState: 'connecting' })
        }
        router.push(`/room/${roomCode}`)
      },
      onRoomError({ message }) {
        store.setError(message)
      },
      onPeerJoined({ peerId, displayName, avatarColor }) {
        store.addPeer({ id: peerId, displayName, avatarColor, connectionMode: 'unknown', connectionState: 'connecting' })
      },
      onPeerLeft({ peerId }) {
        store.removePeer(peerId)
      },
    }
  }

  function createRoom() {
    const sig = getSignaling()
    if (!sig) return
    store.setRoomState('creating')
    sig.send({ type: 'create_room' })
  }

  function joinRoom(code: string) {
    const sig = getSignaling()
    if (!sig) return
    store.setRoomState('joining')
    sig.send({ type: 'join_room', roomCode: code })
  }

  function leaveRoom() {
    const sig = getSignaling()
    if (sig) {
      sig.send({ type: 'leave_room' })
    }
    store.reset()
    router.push('/')
  }

  return {
    store,
    buildCallbacks,
    createRoom,
    joinRoom,
    leaveRoom,
  }
}
