import { ref, computed } from 'vue'

const adjectives = ['快乐的', '好奇的', '勇敢的', '勤劳的', '聪明的', '自由的', '热情的', '冷静的', '幽默的', '神秘的']
const nouns = ['开发者', '程序员', '极客', '工程师', '探索者', '冒险家', '创客家', '梦想家', '黑客', '架构师']

function randomPick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

function hashToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

const userName = ref(randomPick(adjectives) + randomPick(nouns))

export function useUserProfile() {
  const avatarColor = computed(() => hashToColor(userName.value))
  const avatarChar = computed(() => userName.value.charAt(0))

  function updateName(name: string) {
    const trimmed = name.trim()
    if (trimmed) {
      userName.value = trimmed
    }
  }

  return {
    userName,
    avatarColor,
    avatarChar,
    updateName,
  }
}
