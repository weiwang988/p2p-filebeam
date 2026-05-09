export interface SignalingMessage {
  type: string
  [key: string]: unknown
}

export interface CreateRoomMessage extends SignalingMessage {
  type: 'create_room'
}

export interface JoinRoomMessage extends SignalingMessage {
  type: 'join_room'
  roomCode: string
}

export interface SdpOfferMessage extends SignalingMessage {
  type: 'sdp_offer'
  target: string
  sdp: RTCSessionDescriptionInit
}

export interface SdpAnswerMessage extends SignalingMessage {
  type: 'sdp_answer'
  target: string
  sdp: RTCSessionDescriptionInit
}

export interface IceCandidateMessage extends SignalingMessage {
  type: 'ice_candidate'
  target: string
  candidate: RTCIceCandidateInit
}

export interface LeaveRoomMessage extends SignalingMessage {
  type: 'leave_room'
}

export interface PingMessage extends SignalingMessage {
  type: 'ping'
}

// Server -> Client
export interface RoomCreatedMessage extends SignalingMessage {
  type: 'room_created'
  roomCode: string
  peerId: string
}

export interface RoomJoinedMessage extends SignalingMessage {
  type: 'room_joined'
  roomCode: string
  peerId: string
  peers: string[]
}

export interface RoomErrorMessage extends SignalingMessage {
  type: 'room_error'
  code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'INVALID_CODE' | 'SERVER_ERROR'
  message: string
}

export interface PeerJoinedMessage extends SignalingMessage {
  type: 'peer_joined'
  peerId: string
}

export interface PeerLeftMessage extends SignalingMessage {
  type: 'peer_left'
  peerId: string
}

export interface RelaySdpOfferMessage extends SignalingMessage {
  type: 'sdp_offer'
  from: string
  sdp: RTCSessionDescriptionInit
}

export interface RelaySdpAnswerMessage extends SignalingMessage {
  type: 'sdp_answer'
  from: string
  sdp: RTCSessionDescriptionInit
}

export interface RelayIceCandidateMessage extends SignalingMessage {
  type: 'ice_candidate'
  from: string
  candidate: RTCIceCandidateInit
}

export interface ConnectionModeMessage extends SignalingMessage {
  type: 'connection_mode'
  target: string
  mode: 'lan' | 'turn'
}

export interface RelayConnectionModeMessage extends SignalingMessage {
  type: 'connection_mode'
  from: string
  mode: 'lan' | 'turn'
}

export interface PongMessage extends SignalingMessage {
  type: 'pong'
}

export interface Room {
  code: string
  peers: Map<string, PeerInfo>
  createdAt: number
}

export interface PeerInfo {
  id: string
  joinedAt: number
  displayName: string
  avatarColor: string
  send: (data: string) => void
}

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | SdpOfferMessage
  | SdpAnswerMessage
  | IceCandidateMessage
  | LeaveRoomMessage
  | PingMessage
  | ConnectionModeMessage
