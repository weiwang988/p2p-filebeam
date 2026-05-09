import { inject } from 'vue'
import type { useApp } from './useApp'

export type App = ReturnType<typeof useApp>

export function injectApp(): App {
  const app = inject<App>('app')
  if (!app) throw new Error('App not provided. Ensure App.vue provides the app instance.')
  return app
}
