import type { RoomManager } from './RoomManager'
import type { PeerInfo, SignalingMessage } from './types'

const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/

export class MessageHandler {
  constructor(private roomManager: RoomManager) {}

  handleMessage(peer: PeerInfo, message: SignalingMessage): { handled: boolean } {
    switch (message.type) {
      case 'create_room':
        return this.handleCreateRoom(peer, message)
      case 'join_room':
        return this.handleJoinRoom(peer, message)
      case 'sdp_offer':
        return this.relayMessage(peer, message, 'sdp_offer')
      case 'sdp_answer':
        return this.relayMessage(peer, message, 'sdp_answer')
      case 'ice_candidate':
        return this.relayMessage(peer, message, 'ice_candidate')
      case 'leave_room':
        return this.handleLeaveRoom(peer)
      case 'connection_mode':
        return this.relayMessage(peer, message, 'connection_mode')
      case 'ping':
        peer.send(JSON.stringify({ type: 'pong' }))
        return { handled: true }
      default:
        return { handled: false }
    }
  }

  private handleCreateRoom(peer: PeerInfo, message: SignalingMessage): { handled: boolean } {
    peer.displayName = typeof message.displayName === 'string' ? message.displayName : peer.id
    peer.avatarColor = typeof message.avatarColor === 'string' ? message.avatarColor : ''

    const room = this.roomManager.createRoom(peer.id)
    room.peers.set(peer.id, peer)

    peer.send(JSON.stringify({
      type: 'room_created',
      roomCode: room.code,
      peerId: peer.id,
      peerName: peer.displayName,
      avatarColor: peer.avatarColor,
    }))
    return { handled: true }
  }

  private handleJoinRoom(peer: PeerInfo, message: SignalingMessage): { handled: boolean } {
    const roomCode = typeof message.roomCode === 'string' ? message.roomCode.toUpperCase() : ''

    if (!ROOM_CODE_REGEX.test(roomCode)) {
      peer.send(JSON.stringify({
        type: 'room_error',
        code: 'INVALID_CODE',
        message: 'Room code must be 6 letters or numbers.',
      }))
      return { handled: true }
    }

    peer.displayName = typeof message.displayName === 'string' ? message.displayName : peer.id
    peer.avatarColor = typeof message.avatarColor === 'string' ? message.avatarColor : ''

    const result = this.roomManager.joinRoom(roomCode, peer)

    if (!result.joined) {
      peer.send(JSON.stringify({
        type: 'room_error',
        code: result.error,
        message: result.error === 'ROOM_NOT_FOUND'
          ? 'Room not found or expired.'
          : 'Room is full (max 10 devices).',
      }))
      return { handled: true }
    }

    const room = this.roomManager.getRoom(roomCode)
    const existingPeers = result.peers
      .filter(id => id !== peer.id)
      .map(id => {
        const info = room?.peers.get(id)
        return {
          peerId: id,
          displayName: info?.displayName || id,
          avatarColor: info?.avatarColor || '',
        }
      })

    peer.send(JSON.stringify({
      type: 'room_joined',
      roomCode,
      peerId: peer.id,
      peerName: peer.displayName,
      avatarColor: peer.avatarColor,
      peers: existingPeers,
    }))

    this.broadcast(roomCode, peer.id, {
      type: 'peer_joined',
      peerId: peer.id,
      displayName: peer.displayName,
      avatarColor: peer.avatarColor,
    })

    return { handled: true }
  }

  private handleLeaveRoom(peer: PeerInfo): { handled: boolean } {
    const room = this.roomManager.getPeerRoom(peer.id)
    if (!room) return { handled: true }

    const result = this.roomManager.leaveRoom(room.code, peer.id)
    if (result.removed && !result.deleted) {
      this.broadcast(room.code, peer.id, {
        type: 'peer_left',
        peerId: peer.id,
      })
    }
    return { handled: true }
  }

  private relayMessage(
    peer: PeerInfo,
    message: SignalingMessage,
    type: string,
  ): { handled: boolean } {
    const target = message.target as string | undefined
    if (!target) return { handled: false }

    const room = this.roomManager.getPeerRoom(peer.id)
    if (!room) return { handled: false }

    const targetPeer = room.peers.get(target)
    if (!targetPeer) return { handled: false }

    const relay: Record<string, unknown> = { type, from: peer.id }

    if (type === 'sdp_offer' || type === 'sdp_answer') {
      relay.sdp = message.sdp
    } else if (type === 'ice_candidate') {
      relay.candidate = message.candidate
    } else if (type === 'connection_mode') {
      relay.mode = message.mode
    }

    targetPeer.send(JSON.stringify(relay))
    return { handled: true }
  }

  private broadcast(roomCode: string, excludePeerId: string, message: Record<string, unknown>): void {
    const room = this.roomManager.getRoom(roomCode)
    if (!room) return

    for (const [peerId, peer] of room.peers) {
      if (peerId === excludePeerId) continue
      peer.send(JSON.stringify(message))
    }
  }
}
