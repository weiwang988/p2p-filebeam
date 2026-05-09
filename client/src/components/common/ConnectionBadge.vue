<template>
  <div class="connection-badge">
    <span class="badge-dot" :class="modeClass"></span>
    <span class="badge-label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  mode: 'lan' | 'turn' | 'connecting' | 'unknown' | 'idle'
}>()

const modeClass = computed(() => props.mode)

const label = computed(() => {
  switch (props.mode) {
    case 'lan': return '局域网直连'
    case 'turn': return '中继传输'
    case 'connecting': return '连接中...'
    case 'idle': return '无设备'
    default: return '未知'
  }
})
</script>

<style scoped>
.connection-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #21262d;
  border-radius: 20px;
  font-size: 0.8rem;
}

.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.badge-dot.lan { background: #3fb950; }
.badge-dot.turn { background: #d29922; }
.badge-dot.connecting { background: #58a6ff; animation: pulse 1.5s infinite; }
.badge-dot.unknown { background: #484f58; }
.badge-dot.idle { background: #484f58; }

.badge-label {
  color: #8b949e;
  white-space: nowrap;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
