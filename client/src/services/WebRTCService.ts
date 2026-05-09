import { ConnectionDetector } from './ConnectionDetector'
import type { ConnectionMode } from '@/types/webrtc'

export interface WebRTCCallbacks {
  onDataChannelOpen?: (peerId: string) => void
  onDataChannelClose?: (peerId: string) => void
  onMessage?: (peerId: string, data: string | ArrayBuffer) => void
  onConnectionModeDetected?: (peerId: string, mode: ConnectionMode) => void
  onIceCandidate?: (peerId: string, candidate: RTCIceCandidateInit) => void
}

function getIceServers(): RTCIceServer[] {
  if (import.meta.env.VITE_ICE_SERVERS) {
    try {
      return JSON.parse(import.meta.env.VITE_ICE_SERVERS)
    } catch { /* fall through to defaults */ }
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

const ICE_SERVERS: RTCIceServer[] = getIceServers()

export class WebRTCService {
  private connections = new Map<string, RTCPeerConnection>()
  private dataChannels = new Map<string, RTCDataChannel>()
  private callbacks: WebRTCCallbacks

  constructor(callbacks: WebRTCCallbacks = {}) {
    this.callbacks = callbacks
  }

  getDataChannel(peerId: string): RTCDataChannel | undefined {
    return this.dataChannels.get(peerId)
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.createPeerConnection(peerId)

    const dataChannel = pc.createDataChannel('filebeam', { ordered: true })
    this.setupDataChannel(dataChannel, peerId)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    return pc.localDescription!
  }

  async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    const pc = this.createPeerConnection(peerId)

    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return pc.localDescription!
  }

  async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.connections.get(peerId)
    if (!pc) return
    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
  }

  async addIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.connections.get(peerId)
    if (!pc) return
    await pc.addIceCandidate(new RTCIceCandidate(candidate))
  }

  sendTo(peerId: string, data: string | ArrayBuffer): boolean {
    const dc = this.dataChannels.get(peerId)
    if (!dc || dc.readyState !== 'open') return false
    dc.send(data as any)
    return true
  }

  async detectConnectionMode(peerId: string): Promise<ConnectionMode> {
    const pc = this.connections.get(peerId)
    if (!pc) return 'unknown'
    const mode = await ConnectionDetector.detect(pc)
    if (mode !== 'unknown') {
      this.callbacks.onConnectionModeDetected?.(peerId, mode)
    }
    return mode
  }

  disconnect(peerId: string): void {
    const dc = this.dataChannels.get(peerId)
    if (dc) {
      dc.close()
      this.dataChannels.delete(peerId)
    }
    const pc = this.connections.get(peerId)
    if (pc) {
      pc.close()
      this.connections.delete(peerId)
    }
  }

  disconnectAll(): void {
    for (const peerId of this.connections.keys()) {
      this.disconnect(peerId)
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const existing = this.connections.get(peerId)
    if (existing) return existing

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onIceCandidate?.(peerId, event.candidate.toJSON())
      }
    }

    pc.oniceconnectionstatechange = async () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        await this.detectConnectionMode(peerId)
      }
    }

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel, peerId)
    }

    this.connections.set(peerId, pc)
    return pc
  }

  private setupDataChannel(dc: RTCDataChannel, peerId: string): void {
    dc.binaryType = 'arraybuffer'

    dc.onopen = () => {
      this.dataChannels.set(peerId, dc)
      this.callbacks.onDataChannelOpen?.(peerId)
    }

    dc.onclose = () => {
      this.dataChannels.delete(peerId)
      this.callbacks.onDataChannelClose?.(peerId)
    }

    dc.onmessage = (event) => {
      this.callbacks.onMessage?.(peerId, event.data)
    }
  }
}
