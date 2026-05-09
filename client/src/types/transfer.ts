export type TransferStatus = 'pending' | 'transferring' | 'paused' | 'complete' | 'failed' | 'cancelled'

export interface Transfer {
  id: string
  fileId: string
  fileName: string
  fileSize: number
  mimeType: string
  totalChunks: number
  receivedBytes: number
  status: TransferStatus
  direction: 'send' | 'receive'
  peerId: string
  connectionMode: 'lan' | 'turn' | 'unknown'
  startedAt: number
  completedAt: number | null
}

export interface FileMeta {
  fileId: string
  fileName: string
  fileSize: number
  mimeType: string
  totalChunks: number
  chunkSize: number
}
