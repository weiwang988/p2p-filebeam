export interface Peer {
  id: string
  displayName: string
  avatarColor: string
  connectionMode: 'lan' | 'turn' | 'unknown'
  connectionState: 'connecting' | 'connected' | 'disconnected'
}

export type RoomState = 'idle' | 'creating' | 'joining' | 'connected'
