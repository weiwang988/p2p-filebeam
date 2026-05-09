import { generateId } from '@/utils/id'

export interface Chunk {
  fileId: string
  index: number
  totalChunks: number
  data: Blob
}

export interface ChunkHeader {
  fileId: string
  chunkIndex: number
  totalChunks: number
}

export class FileChunker {
  static readonly DEFAULT_CHUNK_SIZE = 64 * 1024

  static chunk(file: File, chunkSize = FileChunker.DEFAULT_CHUNK_SIZE, fileId?: string): Chunk[] {
    const totalChunks = Math.ceil(file.size / chunkSize)
    const id = fileId ?? generateId()

    const chunks: Chunk[] = []
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      chunks.push({
        fileId: id,
        index: i,
        totalChunks,
        data: file.slice(start, end),
      })
    }
    return chunks
  }

  static encodeChunk(chunk: { fileId: string; index: number; totalChunks: number; data: Uint8Array }): ArrayBuffer {
    const header = new ArrayBuffer(24)
    const headerView = new DataView(header)
    const idBytes = new TextEncoder().encode(chunk.fileId)

    const idArr = new Uint8Array(header, 0, 16)
    for (let i = 0; i < Math.min(idBytes.length, 16); i++) {
      idArr[i] = idBytes[i]
    }

    headerView.setUint32(16, chunk.index, false)
    headerView.setUint32(20, chunk.totalChunks, false)

    const combined = new Uint8Array(24 + chunk.data.length)
    combined.set(new Uint8Array(header), 0)
    combined.set(chunk.data, 24)
    return combined.buffer
  }

  static decodeChunkHeader(buffer: ArrayBuffer): ChunkHeader {
    const view = new DataView(buffer)
    const idArr = new Uint8Array(buffer, 0, 16)
    const fileId = new TextDecoder().decode(idArr).replace(/\0/g, '')
    const chunkIndex = view.getUint32(16, false)
    const totalChunks = view.getUint32(20, false)
    return { fileId, chunkIndex, totalChunks }
  }
}
