import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Transfer, TransferStatus } from '@/types/transfer'
import { generateId } from '@/utils/id'

export const useTransferStore = defineStore('transfer', () => {
  const transfers = ref<Transfer[]>([])

  const activeTransfers = computed(() =>
    transfers.value.filter(t => t.status === 'transferring' || t.status === 'pending')
  )

  const completedTransfers = computed(() =>
    transfers.value.filter(t => t.status === 'complete')
  )

  const overallProgress = computed(() => {
    const active = activeTransfers.value
    if (active.length === 0) return 0
    const totalBytes = active.reduce((sum, t) => sum + t.fileSize, 0)
    const receivedBytes = active.reduce((sum, t) => sum + t.receivedBytes, 0)
    return totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0
  })

  function addTransfer(t: Omit<Transfer, 'id' | 'startedAt' | 'completedAt'>): string {
    const id = generateId()
    transfers.value.push({
      ...t,
      id,
      startedAt: Date.now(),
      completedAt: null,
    })
    return id
  }

  function updateProgress(transferId: string, receivedBytes: number) {
    const t = transfers.value.find(x => x.id === transferId)
    if (t) {
      t.receivedBytes = receivedBytes
    }
  }

  function setStatus(transferId: string, status: TransferStatus) {
    const t = transfers.value.find(x => x.id === transferId)
    if (t) {
      t.status = status
      if (status === 'complete' || status === 'failed' || status === 'cancelled') {
        t.completedAt = Date.now()
      }
    }
  }

  function removeTransfer(transferId: string) {
    transfers.value = transfers.value.filter(t => t.id !== transferId)
  }

  function getTransfer(transferId: string): Transfer | undefined {
    return transfers.value.find(t => t.id === transferId)
  }

  return {
    transfers,
    activeTransfers,
    completedTransfers,
    overallProgress,
    addTransfer,
    updateProgress,
    setStatus,
    removeTransfer,
    getTransfer,
  }
})
