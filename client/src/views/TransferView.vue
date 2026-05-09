<template>
  <div class="transfer">
    <header class="transfer-header">
      <n-button text @click="router.push(`/room/${store.roomCode}`)">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        返回房间
      </n-button>
      <span class="header-badges">
        <ConnectionBadge :mode="overallMode" />
        <button
          class="crypto-badge"
          :class="{
            'crypto-on': app.encryptionEnabled.value,
            'crypto-off': !app.encryptionEnabled.value && app.cryptoAvailable,
            'crypto-na': !app.cryptoAvailable,
          }"
          :disabled="!app.cryptoAvailable"
          :title="cryptoLabel"
          @click="app.toggleEncryption()"
        >
          {{ cryptoLabel }}
        </button>
      </span>
    </header>

    <div class="transfer-body">
      <h3 class="section-title">传输列表</h3>

      <div v-if="transfers.transfers.length === 0" class="empty-state">
        <p>暂无传输任务</p>
        <n-button @click="router.push(`/room/${store.roomCode}`)">返回房间</n-button>
      </div>

      <div v-else class="transfer-list">
        <div v-for="t in transfers.transfers" :key="t.id" class="transfer-card">
          <div class="transfer-file-info">
            <span class="tf-name">{{ t.fileName }}</span>
            <span class="tf-size">{{ formatFileSize(t.fileSize) }}</span>
            <span class="tf-direction">{{ t.direction === 'send' ? '发送' : '接收' }}</span>
          </div>
          <div v-if="t.direction === 'receive'" class="tf-peer">
            <span class="tf-peer-dot" :style="{ background: getPeerAvatarColor(t.peerId) }"></span>
            <span class="tf-peer-name">来自 {{ getPeerName(t.peerId) }}</span>
          </div>
          <div class="tf-progress">
            <div class="tf-bar">
              <div class="tf-fill" :style="{ width: progressPercent(t) + '%' }" :class="t.status"></div>
            </div>
            <span class="tf-percent">{{ progressPercent(t) }}%</span>
          </div>
          <div class="tf-meta">
            <span class="tf-status" :class="t.status">{{ statusLabel(t.status) }}</span>
            <span class="tf-mode">{{ t.connectionMode === 'lan' ? '局域网直连' : t.connectionMode === 'turn' ? '中继传输' : '' }}</span>
          </div>
          <div v-if="t.status === 'transferring'" class="tf-actions">
            <n-button size="tiny" @click="app.pauseTransfer(t.id)">暂停</n-button>
            <n-button size="tiny" type="error" @click="app.cancelTransfer(t.id)">取消</n-button>
          </div>
          <div v-if="t.status === 'paused'" class="tf-actions">
            <n-button size="tiny" type="primary" @click="app.resumeTransfer(t.id)">继续</n-button>
            <n-button size="tiny" type="error" @click="app.cancelTransfer(t.id)">取消</n-button>
          </div>
          <div v-if="t.status === 'complete'" class="tf-complete">
            <template v-if="t.direction === 'receive'">
              <n-button size="tiny" type="primary" @click="app.downloadReceivedFile(t.id)">下载文件</n-button>
            </template>
            <template v-else>
              <span>已完成</span>
            </template>
          </div>
          <div v-if="t.status === 'failed'" class="tf-failed-msg">
            <span>传输失败</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NButton } from 'naive-ui'
import { injectApp } from '@/composables/injectApp'
import { formatFileSize } from '@/utils/format'
import ConnectionBadge from '@/components/common/ConnectionBadge.vue'
import type { Transfer } from '@/types/transfer'

const app = injectApp()
const store = app.store
const transfers = app.transferStore
const router = useRouter()

const cryptoLabel = computed(() => {
  if (!app.cryptoAvailable) return '加密不可用'
  return app.encryptionEnabled.value ? '已加密' : '明文'
})

const overallMode = computed<'lan' | 'turn' | 'connecting' | 'unknown' | 'idle'>(() => {
  if (store.peers.length === 0) return 'idle'
  const modes = store.peers.map(p => p.connectionMode)
  if (modes.every(m => m === 'lan')) return 'lan'
  if (modes.some(m => m === 'turn')) return 'turn'
  if (modes.some(m => m === 'unknown')) return 'connecting'
  return 'unknown'
})

function progressPercent(t: Transfer): number {
  if (t.fileSize === 0) return 0
  return Math.min(100, Math.round((t.receivedBytes / t.fileSize) * 100))
}

function getPeerName(peerId: string): string {
  const peer = store.peers.find(p => p.id === peerId)
  return peer?.displayName || peerId
}

function getPeerAvatarColor(peerId: string): string {
  const peer = store.peers.find(p => p.id === peerId)
  return peer?.avatarColor || '#30363d'
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '等待中',
    transferring: '传输中',
    paused: '已暂停',
    complete: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return map[status] || status
}
</script>

<style scoped>
.transfer {
  min-height: 100dvh;
  background: #0d1117;
}

.transfer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
}

.header-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.crypto-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid;
  cursor: pointer;
  transition: all 0.15s;
  background: transparent;
}

.crypto-badge:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.crypto-on {
  color: #3fb950;
  border-color: rgba(63, 185, 80, 0.3);
  background: rgba(63, 185, 80, 0.1);
}

.crypto-off {
  color: #d29922;
  border-color: rgba(210, 153, 34, 0.3);
  background: rgba(210, 153, 34, 0.1);
}

.crypto-na {
  color: #f85149;
  border-color: rgba(248, 81, 73, 0.3);
  background: rgba(248, 81, 73, 0.1);
}

.transfer-body {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px;
}

.section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #8b949e;
  letter-spacing: 0.5px;
  margin: 0 0 16px;
}

.empty-state {
  text-align: center;
  padding: 48px;
  color: #8b949e;
}

.transfer-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.transfer-card {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 10px;
  padding: 16px;
}

.transfer-file-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.tf-name {
  color: #e6edf3;
  font-size: 0.9rem;
  flex: 1;
}

.tf-size {
  color: #484f58;
  font-size: 0.8rem;
  margin: 0 12px;
}

.tf-direction {
  color: #58a6ff;
  font-size: 0.8rem;
}

.tf-peer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.tf-peer-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tf-peer-name {
  color: #8b949e;
  font-size: 0.8rem;
}

.tf-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.tf-bar {
  flex: 1;
  height: 6px;
  background: #21262d;
  border-radius: 3px;
  overflow: hidden;
}

.tf-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.tf-fill.transferring { background: #18a058; }
.tf-fill.complete { background: #3fb950; }
.tf-fill.paused { background: #d29922; }
.tf-fill.failed { background: #f85149; }
.tf-fill.cancelled { background: #484f58; }

.tf-percent {
  font-size: 0.8rem;
  color: #8b949e;
  width: 36px;
  text-align: right;
}

.tf-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
}

.tf-status {
  color: #8b949e;
}

.tf-status.complete { color: #3fb950; }
.tf-status.failed { color: #f85149; }

.tf-mode {
  color: #484f58;
}

.tf-actions,
.tf-complete,
.tf-failed-msg {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.tf-complete span {
  color: #3fb950;
  font-size: 0.85rem;
  font-weight: 500;
}

.tf-failed-msg span {
  color: #f85149;
  font-size: 0.85rem;
}
</style>
