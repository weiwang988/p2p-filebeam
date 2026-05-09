import { describe, it, expect, beforeEach } from 'vitest'
import { FileAssembler } from './FileAssembler'

function makeChunk(fileId: string, index: number, totalChunks: number, size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.fill(index + 65) // 'A', 'B', 'C', ...
  return bytes
}

describe('FileAssembler', () => {
  let assembler: FileAssembler

  beforeEach(() => {
    assembler = new FileAssembler()
  })

  describe('addMeta', () => {
    it('stores file metadata', () => {
      assembler.addMeta({
        fileId: 'f1',
        fileName: 'test.txt',
        fileSize: 300,
        mimeType: 'text/plain',
        totalChunks: 3,
        chunkSize: 100,
      })
      const meta = assembler.getMeta('f1')
      expect(meta?.fileSize).toBe(300)
      expect(meta?.totalChunks).toBe(3)
    })
  })

  describe('addChunk', () => {
    it('returns false while chunks are still pending', () => {
      assembler.addMeta({ fileId: 'f1', fileName: 'a.txt', fileSize: 300, mimeType: 'text/plain', totalChunks: 3, chunkSize: 100 })
      expect(assembler.addChunk('f1', 0, 3, makeChunk('f1', 0, 3, 100))).toBe(false)
      expect(assembler.addChunk('f1', 1, 3, makeChunk('f1', 1, 3, 100))).toBe(false)
    })

    it('returns true when the last chunk arrives', () => {
      assembler.addMeta({ fileId: 'f1', fileName: 'a.txt', fileSize: 300, mimeType: 'text/plain', totalChunks: 3, chunkSize: 100 })
      assembler.addChunk('f1', 0, 3, makeChunk('f1', 0, 3, 100))
      assembler.addChunk('f1', 1, 3, makeChunk('f1', 1, 3, 100))
      const complete = assembler.addChunk('f1', 2, 3, makeChunk('f1', 2, 3, 100))
      expect(complete).toBe(true)
    })

    it('handles out-of-order chunks', () => {
      assembler.addMeta({ fileId: 'f1', fileName: 'a.txt', fileSize: 300, mimeType: 'text/plain', totalChunks: 3, chunkSize: 100 })
      assembler.addChunk('f1', 2, 3, makeChunk('f1', 2, 3, 100))
      assembler.addChunk('f1', 0, 3, makeChunk('f1', 0, 3, 100))
      const complete = assembler.addChunk('f1', 1, 3, makeChunk('f1', 1, 3, 100))
      expect(complete).toBe(true)
    })
  })

  describe('assemble', () => {
    it('assembles ordered chunks into correct Blob', () => {
      assembler.addMeta({ fileId: 'f1', fileName: 'a.txt', fileSize: 200, mimeType: 'text/plain', totalChunks: 2, chunkSize: 100 })
      assembler.addChunk('f1', 0, 2, makeChunk('f1', 0, 2, 100))
      assembler.addChunk('f1', 1, 2, makeChunk('f1', 1, 2, 100))

      const blob = assembler.assemble('f1')
      expect(blob.size).toBe(200)
      expect(blob.type).toBe('text/plain')
    })

    it('throws when chunks are missing', () => {
      assembler.addMeta({ fileId: 'f1', fileName: 'a.txt', fileSize: 300, mimeType: 'text/plain', totalChunks: 3, chunkSize: 100 })
      assembler.addChunk('f1', 0, 3, makeChunk('f1', 0, 3, 100))
      assembler.addChunk('f1', 2, 3, makeChunk('f1', 2, 3, 100))
      // Missing chunk 1
      expect(() => assembler.assemble('f1')).toThrow('Missing chunk')
    })

    it('throws when file metadata not found', () => {
      expect(() => assembler.assemble('unknown')).toThrow('No metadata')
    })
  })

  describe('remove', () => {
    it('cleans up buffers for a file', () => {
      assembler.addMeta({ fileId: 'f1', fileName: 'a.txt', fileSize: 100, mimeType: 'text/plain', totalChunks: 1, chunkSize: 100 })
      assembler.addChunk('f1', 0, 1, makeChunk('f1', 0, 1, 100))
      assembler.remove('f1')
      expect(assembler.getMeta('f1')).toBeUndefined()
      expect(assembler.getChunkCount('f1')).toBe(0)
    })
  })

  describe('getProgress', () => {
    it('returns received/total chunk count', () => {
      assembler.addMeta({ fileId: 'f1', fileName: 'a.txt', fileSize: 300, mimeType: 'text/plain', totalChunks: 5, chunkSize: 60 })
      assembler.addChunk('f1', 0, 5, makeChunk('f1', 0, 5, 60))
      assembler.addChunk('f1', 3, 5, makeChunk('f1', 3, 5, 60))
      const progress = assembler.getProgress('f1')
      expect(progress?.received).toBe(2)
      expect(progress?.total).toBe(5)
    })
  })
})
