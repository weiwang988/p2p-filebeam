import type { Room, PeerInfo } from './types'

const MAX_ROOM_PEERS = 10
const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return code
}

export class RoomManager {
  private rooms = new Map<string, Room>()

  createRoom(peerId: string): Room {
    let code: string
    do {
      code = generateRoomCode()
    } while (this.rooms.has(code))

    const room: Room = {
      code,
      peers: new Map(),
      createdAt: Date.now(),
    }
    room.peers.set(peerId, { id: peerId, joinedAt: Date.now(), displayName: '', avatarColor: '', send: () => {} })
    this.rooms.set(code, room)
    return room
  }

  joinRoom(code: string, peer: PeerInfo): { joined: true; peers: string[] } | { joined: false; error: string } {
    const room = this.rooms.get(code)
    if (!room) return { joined: false, error: 'ROOM_NOT_FOUND' }
    if (room.peers.size >= MAX_ROOM_PEERS) return { joined: false, error: 'ROOM_FULL' }

    room.peers.set(peer.id, peer)
    const peers = Array.from(room.peers.keys())
    return { joined: true, peers }
  }

  leaveRoom(
    roomCode: string,
    peerId: string,
  ): { removed: true; remainingPeers: string[]; deleted?: boolean } | { removed: false; error: string } {
    const room = this.rooms.get(roomCode)
    if (!room) return { removed: false, error: 'ROOM_NOT_FOUND' }
    if (!room.peers.has(peerId)) return { removed: false, error: 'PEER_NOT_FOUND' }

    room.peers.delete(peerId)

    if (room.peers.size === 0) {
      this.rooms.delete(roomCode)
      return { removed: true, remainingPeers: [], deleted: true }
    }

    return { removed: true, remainingPeers: Array.from(room.peers.keys()) }
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code)
  }

  getPeerIds(roomCode: string): string[] {
    const room = this.rooms.get(roomCode)
    if (!room) return []
    return Array.from(room.peers.keys())
  }

  getPeerRoom(peerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.peers.has(peerId)) return room
    }
    return undefined
  }

  cleanStaleRooms(ttlMs: number): void {
    const cutoff = Date.now() - ttlMs
    for (const [code, room] of this.rooms) {
      if (room.createdAt < cutoff) {
        this.rooms.delete(code)
      }
    }
  }
}
