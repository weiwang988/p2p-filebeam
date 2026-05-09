export const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024

export function validateRoomCode(code: string): string | null {
  if (!code || code.trim().length === 0) return '请输入房间号'
  if (!ROOM_CODE_REGEX.test(code.toUpperCase())) return '房间号为6位字母或数字'
  return null
}

export function validateFile(file: File): string | null {
  if (file.size === 0) return '文件为空'
  if (file.size > MAX_FILE_SIZE) return '文件超过2GB限制'
  return null
}
