import type { FileMeta } from '@/types/transfer'

export class FileAssembler {
  private buffers = new Map<string, Map<number, Uint8Array>>()
  private metas = new Map<string, FileMeta>()
  private chunkCounts = new Map<string, number>()

  addMeta(meta: FileMeta): void {
    this.metas.set(meta.fileId, meta)
    this.buffers.set(meta.fileId, new Map())
    this.chunkCounts.set(meta.fileId, 0)
  }

  addChunk(fileId: string, chunkIndex: number, totalChunks: number, data: Uint8Array): boolean {
    const buffer = this.buffers.get(fileId)
    if (!buffer) return false

    buffer.set(chunkIndex, data)
    this.chunkCounts.set(fileId, buffer.size)

    return buffer.size === totalChunks
  }

  assemble(fileId: string): Blob {
    const meta = this.metas.get(fileId)
    if (!meta) throw new Error(`No metadata for file ${fileId}`)

    const buffer = this.buffers.get(fileId)
    if (!buffer) throw new Error(`No chunks for file ${fileId}`)

    if (buffer.size < meta.totalChunks) {
      const missing: number[] = []
      for (let i = 0; i < meta.totalChunks; i++) {
        if (!buffer.has(i)) missing.push(i)
      }
      throw new Error(`Missing chunk${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`)
    }

    const result = new Uint8Array(meta.fileSize)
    let offset = 0
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunk = buffer.get(i)!
      result.set(chunk, offset)
      offset += chunk.length
    }

    return new Blob([result], { type: meta.mimeType })
  }

  remove(fileId: string): void {
    this.buffers.delete(fileId)
    this.metas.delete(fileId)
    this.chunkCounts.delete(fileId)
  }

  getMeta(fileId: string): FileMeta | undefined {
    return this.metas.get(fileId)
  }

  getChunkCount(fileId: string): number {
    return this.chunkCounts.get(fileId) ?? 0
  }

  getProgress(fileId: string): { received: number; total: number } | undefined {
    const meta = this.metas.get(fileId)
    if (!meta) return undefined
    return {
      received: this.chunkCounts.get(fileId) ?? 0,
      total: meta.totalChunks,
    }
  }
}
