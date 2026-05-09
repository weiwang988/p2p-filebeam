import type { ConnectionMode } from '@/types/webrtc'

export class ConnectionDetector {
  static async detect(pc: RTCPeerConnection): Promise<ConnectionMode> {
    if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
      return 'unknown'
    }

    try {
      const stats = await pc.getStats()
      let mode: ConnectionMode = 'unknown'

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const remoteCandidate = stats.get(report.remoteCandidateId)
          if (remoteCandidate && 'candidateType' in remoteCandidate) {
            const candidateType = (remoteCandidate as any).candidateType
            if (candidateType === 'relay') {
              mode = 'turn'
            } else if (candidateType === 'host' || candidateType === 'srflx') {
              if (mode !== 'turn') mode = 'lan'
            }
          }
        }
      })

      return mode
    } catch {
      return 'unknown'
    }
  }
}
