<template>
  <div class="room">
    <header class="room-header">
      <button class="back-btn" @click="app.leaveRoom()">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        离开
      </button>

      <div class="room-code-section">
        <span class="room-label">房间号</span>
        <div class="room-code-box">
          <span v-for="(ch, i) in (store.roomCode || '')" :key="i" class="code-char">{{ ch }}</span>
        </div>
        <n-button size="tiny" text @click="copyCode">
          <template #icon>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </template>
          {{ copied ? '已复制!' : '复制' }}
        </n-button>
      </div>

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
    </header>

    <div class="room-body">
      <!-- 设备列表 -->
      <aside class="peer-sidebar">
        <h3 class="section-title">
          设备
          <n-tag size="tiny" round>{{ store.peerList.length }}</n-tag>
        </h3>
        <div v-if="store.peers.length === 0" class="empty-hint">
          <p>等待设备加入...</p>
          <n-spin size="small" />
        </div>
        <div class="peer-list">
          <div
            v-for="peer in store.peerList"
            :key="peer.id"
            class="peer-card"
            :class="{ 'is-self': peer.id === store.peerId }"
          >
            <div
              class="peer-avatar"
              :style="{ background: peer.avatarColor || '#30363d' }"
            >
              {{ peer.displayName?.charAt(0) || '?' }}
            </div>
            <div class="peer-info">
              <span class="peer-name">
                {{ peer.displayName || peer.id }}
                <span v-if="peer.id === store.peerId" class="self-tag">自己</span>
              </span>
              <span class="peer-mode">{{ peer.id === store.peerId ? '本机' : peer.connectionMode === 'lan' ? '局域网直连' : peer.connectionMode === 'turn' ? '中继传输' : '连接中...' }}</span>
            </div>
            <span v-if="peer.id !== store.peerId" class="peer-status" :class="peer.connectionState"></span>
          </div>
        </div>
      </aside>

      <!-- 文件区域 -->
      <main class="room-main">
        <h3 class="section-title">文件</h3>
        <div
          class="drop-zone"
          :class="{ 'drop-active': isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <input
            ref="fileInput"
            type="file"
            multiple
            style="display: none"
            @change="handleFileSelect"
          />
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" class="upload-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="drop-text">拖放文件到此处</p>
          <p class="drop-or">或</p>
          <n-button @click="fileInput?.click()" :disabled="store.peers.length === 0">
            选择文件
          </n-button>
        </div>

        <div v-if="files.length > 0" class="file-queue">
          <div v-for="(file, i) in files" :key="i" class="file-item">
            <div class="file-info">
              <span class="file-name">{{ file.name }}</span>
              <span class="file-size">{{ formatFileSize(file.size) }}</span>
            </div>
            <n-button size="tiny" text type="error" @click="removeFile(i)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </n-button>
          </div>
        </div>

        <div v-if="files.length > 0 && store.hasPeers" class="send-section">
          <n-button
            type="primary"
            size="large"
            @click="startTransfer"
          >
            发送 {{ files.length }} 个文件
          </n-button>
        </div>

        <!-- 传输列表 -->
        <div v-if="transfers.transfers.length > 0" class="transfer-section">
          <h3 class="section-title">传输列表</h3>
          <div class="transfer-list">
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
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NTag, NSpin, NBadge } from 'naive-ui'
import { injectApp } from '@/composables/injectApp'
import { formatFileSize } from '@/utils/format'
import { validateFile } from '@/utils/validation'
import ConnectionBadge from '@/components/common/ConnectionBadge.vue'
import type { Transfer } from '@/types/transfer'

const app = injectApp()
const store = app.store
const transfers = app.transferStore
const route = useRoute()
const router = useRouter()

const transferCount = computed(() => transfers.transfers.length)

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

const fileInput = ref<HTMLInputElement>()
const isDragging = ref(false)
const files = ref<File[]>([])
const copied = ref(false)

const cryptoLabel = computed(() => {
  if (!app.cryptoAvailable) return '加密不可用'
  return app.encryptionEnabled.value ? '已加密' : '明文'
})

const overallMode = computed(() => {
  if (store.peers.length === 0) return 'idle'
  const modes = store.peers.map(p => p.connectionMode)
  if (modes.every(m => m === 'lan')) return 'lan'
  if (modes.some(m => m === 'turn')) return 'turn'
  if (modes.some(m => m === 'unknown')) return 'connecting'
  return 'unknown'
})

watch(() => store.roomCode, (code) => {
  if (!code) {
    router.push('/')
  }
}, { immediate: true })

function handleDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files) {
    addFiles(Array.from(e.dataTransfer.files))
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    addFiles(Array.from(input.files))
    input.value = ''
  }
}

function addFiles(newFiles: File[]) {
  for (const file of newFiles) {
    const err = validateFile(file)
    if (err) continue
    files.value.push(file)
  }
}

function removeFile(index: number) {
  files.value.splice(index, 1)
}

async function copyCode() {
  if (!store.roomCode) return
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(store.roomCode)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = store.roomCode
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // clipboard unavailable
  }
}

function startTransfer() {
  app.sendFiles([...files.value])
  files.value = []
}
</script>

<style scoped>
.room {
  min-height: 100dvh;
  background: #0d1117;
}

.room-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  flex-wrap: wrap;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.back-btn:hover {
  color: #e6edf3;
  border-color: #484f58;
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
  margin-left: auto;
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

.room-code-section {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.room-label {
  font-size: 0.8rem;
  color: #8b949e;
  letter-spacing: 0.5px;
}

.room-code-box {
  display: flex;
  gap: 3px;
}

.code-char {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 40px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  font-family: monospace;
  font-size: 1.1rem;
  font-weight: 600;
  color: #18a058;
}

.room-body {
  display: flex;
  gap: 0;
  height: calc(100dvh - 89px);
}

.peer-sidebar {
  width: 200px;
  padding: 16px;
  border-right: 1px solid #30363d;
  overflow-y: auto;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #8b949e;
  letter-spacing: 0.5px;
  margin: 0 0 16px;
}

.empty-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #484f58;
  font-size: 0.85rem;
}

.empty-hint p {
  margin: 0;
}

.peer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.peer-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 8px;
}

.peer-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.self-tag {
  display: inline-block;
  font-size: 0.7rem;
  color: #18a058;
  background: rgba(24, 160, 88, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
  font-weight: 500;
  vertical-align: middle;
}

.peer-info {
  flex: 1;
  min-width: 0;
}

.peer-name {
  display: block;
  font-size: 0.85rem;
  color: #e6edf3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peer-mode {
  font-size: 0.75rem;
  color: #484f58;
}

.peer-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.peer-status.connected { background: #3fb950; }
.peer-status.connecting { background: #d29922; }
.peer-status.disconnected { background: #484f58; }

.room-main {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border: 2px dashed #30363d;
  border-radius: 12px;
  transition: all 0.2s;
  cursor: pointer;
}

.drop-zone:hover,
.drop-zone.drop-active {
  border-color: #18a058;
  background: rgba(24, 160, 88, 0.05);
}

.upload-icon {
  color: #484f58;
  margin-bottom: 8px;
  width: 28px;
  height: 28px;
}

.drop-text {
  color: #8b949e;
  margin: 0 0 2px;
  font-size: 0.85rem;
}

.drop-or {
  color: #484f58;
  margin: 4px 0;
  font-size: 0.8rem;
}

.file-queue {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 8px;
}

.file-info {
  min-width: 0;
}

.file-name {
  display: block;
  color: #e6edf3;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 0.8rem;
  color: #484f58;
}

.send-section {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 传输列表样式 */
.transfer-section {
  margin-top: 24px;
}

.transfer-section .section-title {
  margin-bottom: 12px;
}

.transfer-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.transfer-card {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 10px;
  padding: 14px;
}

.transfer-file-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tf-name {
  color: #e6edf3;
  font-size: 0.9rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tf-size {
  color: #484f58;
  font-size: 0.8rem;
  margin: 0 10px;
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
  margin-bottom: 6px;
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
  margin-top: 8px;
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

@media (max-width: 768px) {
  .room-body {
    flex-direction: column;
    height: auto;
  }

  .peer-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #30363d;
    padding: 16px;
  }

  .peer-list {
    flex-direction: row;
    overflow-x: auto;
    gap: 8px;
  }

  .peer-card {
    min-width: 140px;
    flex-shrink: 0;
  }

  .room-main {
    padding: 16px;
  }

  .drop-zone {
    padding: 32px 16px;
  }
}
</style>
