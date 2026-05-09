export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(2)
    crypto.getRandomValues(arr)
    return arr[0]!.toString(36).padStart(8, '0') + arr[1]!.toString(36).padStart(8, '0')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 16)
}
