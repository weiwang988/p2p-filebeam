<template>
  <div class="home">
    <header class="home-header">
      <svg class="logo" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 13V7l-5-5H8L3 7v10l5 5h4"/>
        <path d="M8 2v5H3"/>
        <path d="M12 22v-7l-3 3"/>
        <path d="M12 15l3 3"/>
        <path d="M12 15V9"/>
      </svg>
      <div class="user-row">
        <div class="user-avatar" :style="{ background: avatarColor }">{{ avatarChar }}</div>
        <span
          v-if="!isEditing"
          class="user-name"
          @click="startEdit"
          title="点击修改名称"
        >{{ userName }}</span>
        <n-input
          v-else
          v-model:value="editName"
          size="small"
          class="user-name-input"
          @keyup.enter="saveEdit"
          @blur="saveEdit"
          @keyup.escape="cancelEdit"
        />
      </div>
      <h1 class="title">FileBeam</h1>
      <p class="subtitle">P2P 文件共享 — 快速 · 直连 · 安全</p>

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

    <div class="cards">
      <div class="action-card card-create">
        <h2 class="card-title">创建房间</h2>
        <p class="card-desc">创建一个房间并分享房间号，对方加入后即可直接发送文件。</p>
        <n-button
          type="primary"
          size="large"
          block
          :loading="app.store.roomState === 'creating'"
          @click="app.createRoom(userName, avatarColor)"
        >
          {{ app.store.roomState === 'creating' ? '创建中...' : '创建房间' }}
        </n-button>
      </div>

      <div class="action-card card-join">
        <h2 class="card-title">加入房间</h2>
        <p class="card-desc">输入房间号连接到创建者，接收对方发送的文件。</p>
        <n-form @submit.prevent="handleJoin">
          <n-form-item
            :feedback="joinError"
            :validation-status="joinError ? 'error' : undefined"
          >
            <n-input
              v-model:value="roomCode"
              placeholder="输入6位房间号（如 ABC123）"
              size="large"
              :maxlength="6"
              :disabled="app.store.roomState === 'joining'"
              style="text-transform: uppercase; text-align: center; letter-spacing: 4px; font-size: 1.2rem; font-family: monospace;"
              @update:value="joinError = undefined"
            />
          </n-form-item>
          <n-button
            type="primary"
            size="large"
            block
            :loading="app.store.roomState === 'joining'"
            :disabled="!roomCode || roomCode.length !== 6"
            attr-type="submit"
          >
            {{ app.store.roomState === 'joining' ? '加入中...' : '加入房间' }}
          </n-button>
        </n-form>
      </div>
    </div>

    <div v-if="app.store.error" class="error-toast">
      <n-alert type="error" :title="app.store.error || undefined" closable @close="app.store.error = null" />
    </div>

    <div class="connection-status">
      <n-tag :type="app.isConnected.value ? 'success' : 'warning'" size="small" round>
        {{ app.isConnected.value ? '已连接' : '连接中...' }}
      </n-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NButton, NInput, NForm, NFormItem, NAlert, NTag } from 'naive-ui'
import { injectApp } from '@/composables/injectApp'
import { useUserProfile } from '@/composables/useUserProfile'
import { validateRoomCode } from '@/utils/validation'

const app = injectApp()
const roomCode = ref('')
const cryptoLabel = computed(() => {
  if (!app.cryptoAvailable) return '加密不可用'
  return app.encryptionEnabled.value ? '已加密' : '明文'
})
const joinError = ref<string>()

const { userName, avatarColor, avatarChar, updateName } = useUserProfile()
const isEditing = ref(false)
const editName = ref('')

function startEdit() {
  editName.value = userName.value
  isEditing.value = true
}

function saveEdit() {
  updateName(editName.value)
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

function handleJoin() {
  const code = roomCode.value.toUpperCase()
  const error = validateRoomCode(code)
  if (error) {
    joinError.value = error
    return
  }
  app.joinRoom(code, userName.value, avatarColor.value)
}
</script>

<style scoped>
.home {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #0d1117;
}

.home-header {
  text-align: center;
  margin-bottom: 48px;
}

.logo {
  color: #18a058;
  margin-bottom: 12px;
}

.user-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.user-name {
  font-size: 1rem;
  color: #e6edf3;
  cursor: pointer;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.2s;
}

.user-name:hover {
  border-bottom-color: #8b949e;
}

.user-name-input {
  width: 180px;
}

.title {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0 0 8px;
  color: #e6edf3;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 1rem;
  color: #8b949e;
  margin: 0;
}

.crypto-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 12px;
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

.cards {
  display: flex;
  gap: 24px;
  max-width: 700px;
  width: 100%;
}

.action-card {
  flex: 1;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 28px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.action-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}

.card-title {
  margin: 0 0 12px;
  font-size: 1.25rem;
  font-weight: 600;
  color: #e6edf3;
}

.card-desc {
  color: #8b949e;
  margin: 0 0 20px;
  font-size: 0.9rem;
  line-height: 1.5;
}

.error-toast {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  width: 90%;
  max-width: 500px;
}

.connection-status {
  margin-top: 32px;
}

@media (max-width: 768px) {
  .cards {
    flex-direction: column;
  }

  .title {
    font-size: 2rem;
  }

  .home {
    justify-content: flex-start;
    padding-top: 60px;
  }
}
</style>
