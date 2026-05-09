import { describe, it, expect } from 'vitest'
import { FileChunker } from './FileChunker'

function makeFile(name: string, size: number): File {
  const content = 'x'.repeat(size)
  return new File([content], name, { type: 'text/plain' })
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Response(blob).arrayBuffer()
}

describe('FileChunker', () => {
  describe('chunk', () => {
    it('chunks a file into correct number of pieces', () => {
      const file = makeFile('test.txt', 200_000)
      const chunks = FileChunker.chunk(file, 64 * 1024)
      // 200KB / 64KB = 3.05 → 4 chunks
      expect(chunks.length).toBe(4)
    })

    it('chunk indices are sequential', () => {
      const file = makeFile('test.txt', 500_000)
      const chunks = FileChunker.chunk(file, 64 * 1024)
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].index).toBe(i)
      }
    })

    it('single chunk for file smaller than chunk size', () => {
      const file = makeFile('small.txt', 100)
      const chunks = FileChunker.chunk(file, 64 * 1024)
      expect(chunks.length).toBe(1)
      expect(chunks[0].totalChunks).toBe(1)
      expect(chunks[0].index).toBe(0)
    })

    it('generates a unique fileId for each file', () => {
      const file1 = makeFile('a.txt', 100)
      const file2 = makeFile('b.txt', 200)
      const chunks1 = FileChunker.chunk(file1)
      const chunks2 = FileChunker.chunk(file2)
      expect(chunks1[0].fileId).not.toBe(chunks2[0].fileId)
    })

    it('uses provided fileId when passed to chunk()', () => {
      const file = makeFile('test.txt', 100)
      const customId = 'my_custom_file_id_123'
      const chunks = FileChunker.chunk(file, FileChunker.DEFAULT_CHUNK_SIZE, customId)
      expect(chunks[0].fileId).toBe(customId)
    })

    it('generates a new fileId when none is provided', () => {
      const file = makeFile('test.txt', 100)
      const chunks = FileChunker.chunk(file)
      expect(chunks[0].fileId).toBeTruthy()
      expect(chunks[0].fileId.length).toBeGreaterThan(0)
    })

    it('all chunks for same file share the same fileId', () => {
      const file = makeFile('test.txt', 200_000)
      const chunks = FileChunker.chunk(file)
      const firstId = chunks[0].fileId
      for (const chunk of chunks) {
        expect(chunk.fileId).toBe(firstId)
      }
    })

    it('handles exact chunk size boundary', () => {
      const chunkSize = 64 * 1024
      const file = makeFile('exact.txt', chunkSize * 2)
      const chunks = FileChunker.chunk(file, chunkSize)
      expect(chunks.length).toBe(2)
    })

    it('handles 1-byte file', () => {
      const file = makeFile('tiny.txt', 1)
      const chunks = FileChunker.chunk(file)
      expect(chunks.length).toBe(1)
    })
  })

  describe('encodeChunk', () => {
    it('produces an ArrayBuffer with 24-byte header + data', () => {
      // Direct test with known data, avoiding jsdom Blob quirks
      const data = new Uint8Array(100).fill(65) // 100 bytes of 'A'
      const encoded = FileChunker.encodeChunk({
        fileId: 'test-file-id-12345',
        index: 0,
        totalChunks: 1,
        data,
      })
      // 24 header + 100 data = 124
      expect(encoded.byteLength).toBe(24 + 100)
    })

    it('writes correct chunkIndex and totalChunks to header', () => {
      const data = new Uint8Array(64 * 1024)
      const encoded = FileChunker.encodeChunk({
        fileId: 'abc123',
        index: 5,
        totalChunks: 10,
        data,
      })
      const view = new DataView(encoded)
      expect(view.getUint32(16, false)).toBe(5)
      expect(view.getUint32(20, false)).toBe(10)
    })
  })

  describe('decodeChunkHeader', () => {
    it('extracts fileId, chunkIndex, and totalChunks from encoded data', () => {
      const data = new Uint8Array(50)
      const fileId = 'test-file-id-xyz'
      const encoded = FileChunker.encodeChunk({ fileId, index: 3, totalChunks: 7, data })
      const decoded = FileChunker.decodeChunkHeader(encoded)
      expect(decoded.chunkIndex).toBe(3)
      expect(decoded.totalChunks).toBe(7)
      expect(decoded.fileId).toBe(fileId.slice(0, 16))
    })
  })
})
