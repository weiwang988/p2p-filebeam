import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import { MessageHandler } from './MessageHandler'
import { RoomManager } from './RoomManager'
import type { PeerInfo } from './types'

const ROOM_CLEANUP_INTERVAL = 600_000 // 10 minutes
const ROOM_TTL = 3600_000 // 1 hour

let nextPeerId = 1

function generatePeerId(): string {
  return `peer${nextPeerId++}_${Date.now().toString(36)}`
}

export function createSignalingServer(port: number) {
  const roomManager = new RoomManager()
  const messageHandler = new MessageHandler(roomManager)
  const wss = new WebSocketServer({ port })

  // Periodic stale room cleanup
  const cleanupTimer = setInterval(() => {
    roomManager.cleanStaleRooms(ROOM_TTL)
  }, ROOM_CLEANUP_INTERVAL)

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const peerId = generatePeerId()

    const peer: PeerInfo = {
      id: peerId,
      joinedAt: Date.now(),
      displayName: '',
      avatarColor: '',
      send: (data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      },
    }

    ws.on('message', (raw: Buffer) => {
      let message: unknown
      try {
        message = JSON.parse(raw.toString())
      } catch {
        peer.send(JSON.stringify({
          type: 'room_error',
          code: 'SERVER_ERROR',
          message: 'Invalid JSON message.',
        }))
        return
      }

      if (typeof message !== 'object' || message === null || typeof (message as any).type !== 'string') {
        peer.send(JSON.stringify({
          type: 'room_error',
          code: 'SERVER_ERROR',
          message: 'Invalid message format.',
        }))
        return
      }

      messageHandler.handleMessage(peer, message as any)
    })

    ws.on('close', () => {
      messageHandler.handleMessage(peer, { type: 'leave_room' })
    })

    ws.on('error', () => {
      // Log but don't crash
    })
  })

  wss.on('close', () => {
    clearInterval(cleanupTimer)
  })

  console.log(`Signaling server running on ws://localhost:${port}`)
  return wss
}
