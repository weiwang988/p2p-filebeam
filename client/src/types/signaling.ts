export interface PeerInfoData {
  peerId: string
  displayName: string
  avatarColor: string
}

// Client -> Server messages
export interface CreateRoomMessage {
  type: 'create_room'
  displayName: string
  avatarColor: string
}

export interface JoinRoomMessage {
  type: 'join_room'
  roomCode: string
  displayName: string
  avatarColor: string
}

export interface SdpOfferMessage {
  type: 'sdp_offer'
  target: string
  sdp: RTCSessionDescriptionInit
}

export interface SdpAnswerMessage {
  type: 'sdp_answer'
  target: string
  sdp: RTCSessionDescriptionInit
}

export interface IceCandidateMessage {
  type: 'ice_candidate'
  target: string
  candidate: RTCIceCandidateInit
}

export interface LeaveRoomMessage {
  type: 'leave_room'
}

export interface ConnectionModeMessage {
  type: 'connection_mode'
  target: string
  mode: 'lan' | 'turn'
}

export interface PingMessage {
  type: 'ping'
}

// Server -> Client messages
export interface RoomCreatedMessage {
  type: 'room_created'
  roomCode: string
  peerId: string
  peerName: string
  avatarColor: string
}

export interface RoomJoinedMessage {
  type: 'room_joined'
  roomCode: string
  peerId: string
  peerName: string
  avatarColor: string
  peers: PeerInfoData[]
}

export interface RoomErrorMessage {
  type: 'room_error'
  code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'INVALID_CODE' | 'SERVER_ERROR'
  message: string
}

export interface PeerJoinedMessage {
  type: 'peer_joined'
  peerId: string
  displayName: string
  avatarColor: string
}

export interface PeerLeftMessage {
  type: 'peer_left'
  peerId: string
}

export interface RelaySdpOfferMessage {
  type: 'sdp_offer'
  from: string
  sdp: RTCSessionDescriptionInit
}

export interface RelaySdpAnswerMessage {
  type: 'sdp_answer'
  from: string
  sdp: RTCSessionDescriptionInit
}

export interface RelayIceCandidateMessage {
  type: 'ice_candidate'
  from: string
  candidate: RTCIceCandidateInit
}

export interface RelayConnectionModeMessage {
  type: 'connection_mode'
  from: string
  mode: 'lan' | 'turn'
}

export interface PongMessage {
  type: 'pong'
}

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | SdpOfferMessage
  | SdpAnswerMessage
  | IceCandidateMessage
  | LeaveRoomMessage
  | ConnectionModeMessage
  | PingMessage

export type ServerMessage =
  | RoomCreatedMessage
  | RoomJoinedMessage
  | RoomErrorMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | RelaySdpOfferMessage
  | RelaySdpAnswerMessage
  | RelayIceCandidateMessage
  | RelayConnectionModeMessage
  | PongMessage

export type SignalingCallback = (message: ServerMessage) => void
