import { describe, it, expect } from 'vitest'
import { ConnectionDetector } from './ConnectionDetector'

function createMockPC(state: string, candidateType: string): RTCPeerConnection {
  const statsMap = new Map()
  statsMap.set('pair1', {
    type: 'candidate-pair',
    state: 'succeeded',
    remoteCandidateId: 'rc1',
  })
  statsMap.set('rc1', {
    type: 'remote-candidate',
    candidateType,
  })

  return {
    iceConnectionState: state as RTCIceConnectionState,
    getStats: () => Promise.resolve(statsMap as any),
    createDataChannel: () => {},
    createOffer: () => Promise.resolve({} as any),
    setLocalDescription: () => Promise.resolve(),
    setRemoteDescription: () => Promise.resolve(),
    addIceCandidate: () => Promise.resolve(),
    close: () => {},
    onicecandidate: null,
    oniceconnectionstatechange: null,
    ondatachannel: null,
  } as unknown as RTCPeerConnection
}

describe('ConnectionDetector', () => {
  it('detects LAN connection via host candidate', async () => {
    const pc = createMockPC('connected', 'host')
    const mode = await ConnectionDetector.detect(pc)
    expect(mode).toBe('lan')
  })

  it('detects LAN connection via srflx candidate', async () => {
    const pc = createMockPC('connected', 'srflx')
    const mode = await ConnectionDetector.detect(pc)
    expect(mode).toBe('lan')
  })

  it('detects TURN relay connection', async () => {
    const pc = createMockPC('connected', 'relay')
    const mode = await ConnectionDetector.detect(pc)
    expect(mode).toBe('turn')
  })

  it('returns unknown when not connected', async () => {
    const pc = createMockPC('checking', 'host')
    const mode = await ConnectionDetector.detect(pc)
    expect(mode).toBe('unknown')
  })
})
