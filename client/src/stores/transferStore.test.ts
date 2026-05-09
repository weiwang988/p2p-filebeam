import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTransferStore } from './transferStore'

describe('transferStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('addTransfer', () => {
    it('adds a send transfer with correct defaults', () => {
      const store = useTransferStore()
      const id = store.addTransfer({
        fileId: 'fid1',
        fileName: 'test.txt',
        fileSize: 1024,
        mimeType: 'text/plain',
        totalChunks: 2,
        receivedBytes: 0,
        status: 'transferring',
        direction: 'send',
        peerId: 'peer1',
        connectionMode: 'unknown',
      })

      expect(store.transfers).toHaveLength(1)
      expect(store.transfers[0].id).toBe(id)
      expect(store.transfers[0].direction).toBe('send')
      expect(store.transfers[0].status).toBe('transferring')
      expect(store.transfers[0].fileName).toBe('test.txt')
      expect(store.transfers[0].startedAt).toBeGreaterThan(0)
      expect(store.transfers[0].completedAt).toBeNull()
    })

    it('adds a receive transfer with correct defaults', () => {
      const store = useTransferStore()
      const id = store.addTransfer({
        fileId: 'fid2',
        fileName: 'download.jpg',
        fileSize: 2048,
        mimeType: 'image/jpeg',
        totalChunks: 1,
        receivedBytes: 0,
        status: 'pending',
        direction: 'receive',
        peerId: 'peer2',
        connectionMode: 'lan',
      })

      expect(store.transfers).toHaveLength(1)
      expect(store.transfers[0].id).toBe(id)
      expect(store.transfers[0].direction).toBe('receive')
      expect(store.transfers[0].status).toBe('pending')
    })

    it('assigns a unique id to each transfer', () => {
      const store = useTransferStore()
      const id1 = store.addTransfer({
        fileId: 'fid1', fileName: 'a.txt', fileSize: 100, mimeType: 'text/plain',
        totalChunks: 1, receivedBytes: 0, status: 'transferring', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })
      const id2 = store.addTransfer({
        fileId: 'fid2', fileName: 'b.txt', fileSize: 200, mimeType: 'text/plain',
        totalChunks: 1, receivedBytes: 0, status: 'transferring', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })

      expect(id1).not.toBe(id2)
      expect(store.transfers).toHaveLength(2)
    })
  })

  describe('updateProgress', () => {
    it('updates receivedBytes for an existing transfer', () => {
      const store = useTransferStore()
      const id = store.addTransfer({
        fileId: 'fid1', fileName: 'test.txt', fileSize: 1000, mimeType: 'text/plain',
        totalChunks: 2, receivedBytes: 0, status: 'transferring', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })

      store.updateProgress(id, 500)
      expect(store.transfers[0].receivedBytes).toBe(500)

      store.updateProgress(id, 1000)
      expect(store.transfers[0].receivedBytes).toBe(1000)
    })

    it('does nothing for non-existent transfer id', () => {
      const store = useTransferStore()
      store.addTransfer({
        fileId: 'fid1', fileName: 'test.txt', fileSize: 1000, mimeType: 'text/plain',
        totalChunks: 2, receivedBytes: 0, status: 'transferring', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })

      store.updateProgress('nonexistent', 999)
      expect(store.transfers[0].receivedBytes).toBe(0)
    })
  })

  describe('setStatus', () => {
    it('updates status to complete and sets completedAt', () => {
      const store = useTransferStore()
      const id = store.addTransfer({
        fileId: 'fid1', fileName: 'test.txt', fileSize: 1000, mimeType: 'text/plain',
        totalChunks: 2, receivedBytes: 0, status: 'transferring', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })

      store.setStatus(id, 'complete')
      expect(store.transfers[0].status).toBe('complete')
      expect(store.transfers[0].completedAt).toBeGreaterThan(0)
    })

    it('updates status to failed and sets completedAt', () => {
      const store = useTransferStore()
      const id = store.addTransfer({
        fileId: 'fid1', fileName: 'test.txt', fileSize: 1000, mimeType: 'text/plain',
        totalChunks: 2, receivedBytes: 0, status: 'transferring', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })

      store.setStatus(id, 'failed')
      expect(store.transfers[0].status).toBe('failed')
      expect(store.transfers[0].completedAt).toBeGreaterThan(0)
    })

    it('does nothing for non-existent transfer id', () => {
      const store = useTransferStore()
      store.addTransfer({
        fileId: 'fid1', fileName: 'test.txt', fileSize: 1000, mimeType: 'text/plain',
        totalChunks: 2, receivedBytes: 0, status: 'transferring', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })

      store.setStatus('nonexistent', 'complete')
      expect(store.transfers[0].status).toBe('transferring')
      expect(store.transfers[0].completedAt).toBeNull()
    })
  })

  describe('computed getters', () => {
    it('activeTransfers filters transferring and pending', () => {
      const store = useTransferStore()
      store.addTransfer({
        fileId: 'fid1', fileName: 'a.txt', fileSize: 100, mimeType: 'text/plain',
        totalChunks: 1, receivedBytes: 0, status: 'transferring', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })
      store.addTransfer({
        fileId: 'fid2', fileName: 'b.txt', fileSize: 100, mimeType: 'text/plain',
        totalChunks: 1, receivedBytes: 0, status: 'complete', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })
      store.addTransfer({
        fileId: 'fid3', fileName: 'c.txt', fileSize: 100, mimeType: 'text/plain',
        totalChunks: 1, receivedBytes: 0, status: 'pending', direction: 'receive',
        peerId: 'p2', connectionMode: 'unknown',
      })

      expect(store.activeTransfers).toHaveLength(2)
    })

    it('completedTransfers filters only complete', () => {
      const store = useTransferStore()
      store.addTransfer({
        fileId: 'fid1', fileName: 'a.txt', fileSize: 100, mimeType: 'text/plain',
        totalChunks: 1, receivedBytes: 0, status: 'complete', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })
      store.addTransfer({
        fileId: 'fid2', fileName: 'b.txt', fileSize: 100, mimeType: 'text/plain',
        totalChunks: 1, receivedBytes: 0, status: 'transferring', direction: 'send',
        peerId: 'p1', connectionMode: 'unknown',
      })

      expect(store.completedTransfers).toHaveLength(1)
    })
  })
})
