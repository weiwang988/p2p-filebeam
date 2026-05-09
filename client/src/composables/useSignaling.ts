import { ref, onUnmounted, shallowRef } from 'vue'
import type { ClientMessage, ServerMessage, PeerInfoData } from '@/types/signaling'
import { SignalingService } from '@/services/SignalingService'

export interface SignalingCallbacks {
  onRoomCreated?: (data: { roomCode: string; peerId: string; peerName: string; avatarColor: string }) => void
  onRoomJoined?: (data: { roomCode: string; peerId: string; peerName: string; avatarColor: string; peers: PeerInfoData[] }) => void
  onRoomError?: (data: { code: string; message: string }) => void
  onPeerJoined?: (data: { peerId: string; displayName: string; avatarColor: string }) => void
  onPeerLeft?: (data: { peerId: string }) => void
  onSdpOffer?: (data: { from: string; sdp: RTCSessionDescriptionInit }) => void
  onSdpAnswer?: (data: { from: string; sdp: RTCSessionDescriptionInit }) => void
  onIceCandidate?: (data: { from: string; candidate: RTCIceCandidateInit }) => void
  onConnectionMode?: (data: { from: string; mode: 'lan' | 'turn' }) => void
  onDisconnect?: () => void
}

export function useSignaling(url: string, callbacks: SignalingCallbacks = {}) {
  const service = shallowRef(new SignalingService(url))
  const isConnected = ref(false)
  const unsubs: (() => void)[] = []

  function setupListeners(svc: SignalingService) {
    unsubs.forEach(fn => fn())
    unsubs.length = 0

    unsubs.push(svc.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'room_created':
          callbacks.onRoomCreated?.({ roomCode: msg.roomCode, peerId: msg.peerId, peerName: msg.peerName, avatarColor: msg.avatarColor })
          break
        case 'room_joined':
          callbacks.onRoomJoined?.({ roomCode: msg.roomCode, peerId: msg.peerId, peerName: msg.peerName, avatarColor: msg.avatarColor, peers: msg.peers })
          break
        case 'room_error':
          callbacks.onRoomError?.({ code: msg.code, message: msg.message })
          break
        case 'peer_joined':
          callbacks.onPeerJoined?.({ peerId: msg.peerId, displayName: msg.displayName, avatarColor: msg.avatarColor })
          break
        case 'peer_left':
          callbacks.onPeerLeft?.({ peerId: msg.peerId })
          break
        case 'sdp_offer':
          callbacks.onSdpOffer?.({ from: msg.from, sdp: msg.sdp })
          break
        case 'sdp_answer':
          callbacks.onSdpAnswer?.({ from: msg.from, sdp: msg.sdp })
          break
        case 'ice_candidate':
          callbacks.onIceCandidate?.({ from: msg.from, candidate: msg.candidate })
          break
        case 'connection_mode':
          callbacks.onConnectionMode?.({ from: msg.from, mode: msg.mode })
          break
      }
    }))

    unsubs.push(svc.onDisconnect(() => {
      isConnected.value = false
      callbacks.onDisconnect?.()
    }))
  }

  setupListeners(service.value)
  isConnected.value = service.value.isConnected

  service.value.connect().then(() => {
    isConnected.value = true
  }).catch(() => {
    // Connection will be retried by the service
  })

  function send(message: ClientMessage) {
    service.value.send(message)
  }

  function disconnect() {
    service.value.disconnect()
    isConnected.value = false
  }

  onUnmounted(() => {
    disconnect()
  })

  return { isConnected, send, disconnect }
}
