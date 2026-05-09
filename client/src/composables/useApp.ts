import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRoomStore } from '@/stores/roomStore'
import { useTransferStore } from '@/stores/transferStore'
import { SignalingService } from '@/services/SignalingService'
import { WebRTCService } from '@/services/WebRTCService'
import { FileChunker } from '@/services/FileChunker'
import { FileAssembler } from '@/services/FileAssembler'
import { CryptoService } from '@/services/CryptoService'
import { generateId } from '@/utils/id'
import type { ServerMessage } from '@/types/signaling'
import type { FileMeta } from '@/types/transfer'

function getSignalingUrl(): string {
  if (import.meta.env.VITE_SIGNALING_URL) {
    return import.meta.env.VITE_SIGNALING_URL
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Production (built with vite build): nginx proxies /ws to signaling server
  if (import.meta.env.PROD) {
    return `${protocol}//${window.location.host}/ws`
  }
  // Development: signaling server runs on same hostname, port 7766
  return `${protocol}//${window.location.hostname}:7766`
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const result = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    result[i] = binary.charCodeAt(i)
  }
  return result.buffer
}

export function useApp() {
  const router = useRouter()
  const store = useRoomStore()
  const transferStore = useTransferStore()
  const isConnected = ref(false)

  const signaling = new SignalingService(getSignalingUrl())

  const webrtc = new WebRTCService({
    onDataChannelOpen(peerId) {
      if (import.meta.env.DEV) console.log('[WebRTC] DataChannel open:', peerId)
      store.updatePeerConnection(peerId, { connectionState: 'connected' })

      startCryptoHandshake(peerId)
      flushPendingFiles(peerId)
    },
    onMessage(peerId, data) {
      handleDataChannelMessage(peerId, data)
    },
    onConnectionModeDetected(peerId, mode) {
      store.updatePeerConnection(peerId, { connectionMode: mode })
      if (mode !== 'unknown') {
        signaling.send({ type: 'connection_mode', target: peerId, mode })
      }
    },
    onIceCandidate(peerId, candidate) {
      signaling.send({ type: 'ice_candidate', target: peerId, candidate })
    },
  })

  const fileAssembler = new FileAssembler()
  const peerPendingFiles = new Map<string, File[]>()
  const receivedFiles = new Map<string, Blob>()
  const receivedBytesTracker = new Map<string, number>()
  const cryptoServices = new Map<string, CryptoService>()
  const cryptoAvailable = !!window.crypto?.subtle
  const encryptionEnabled = ref(cryptoAvailable)

  // === Signaling message handling ===
  signaling.onMessage((msg: ServerMessage) => {
    switch (msg.type) {
      case 'room_created':
        store.setRoom(msg.roomCode, msg.peerId)
        store.localDisplayName = msg.peerName
        store.localAvatarColor = msg.avatarColor
        router.push(`/room/${msg.roomCode}`)
        break

      case 'room_joined':
        store.setRoom(msg.roomCode, msg.peerId)
        store.localDisplayName = msg.peerName
        store.localAvatarColor = msg.avatarColor
        for (const p of msg.peers) {
          store.addPeer({
            id: p.peerId,
            displayName: p.displayName,
            avatarColor: p.avatarColor,
            connectionMode: 'unknown',
            connectionState: 'connecting',
          })
        }
        router.push(`/room/${msg.roomCode}`)
        break

      case 'room_error':
        store.setError(msg.message)
        break

      case 'peer_joined':
        store.addPeer({
          id: msg.peerId,
          displayName: msg.displayName,
          avatarColor: msg.avatarColor,
          connectionMode: 'unknown',
          connectionState: 'connecting',
        })
        initiateWebRTC(msg.peerId)
        break

      case 'peer_left':
        store.removePeer(msg.peerId)
        webrtc.disconnect(msg.peerId)
        break

      case 'sdp_offer':
        handleSdpOffer(msg.from, msg.sdp)
        break

      case 'sdp_answer':
        webrtc.handleAnswer(msg.from, msg.sdp)
        break

      case 'ice_candidate':
        webrtc.addIceCandidate(msg.from, msg.candidate)
        break

      case 'connection_mode':
        store.updatePeerConnection(msg.from, { connectionMode: msg.mode })
        break
    }
  })

  signaling.onDisconnect(() => {
    isConnected.value = false
  })

  signaling.connect().then(() => {
    isConnected.value = true
  }).catch(() => {})

  // === WebRTC ===
  async function initiateWebRTC(peerId: string) {
    try {
      const offer = await webrtc.createOffer(peerId)
      signaling.send({ type: 'sdp_offer', target: peerId, sdp: offer })
    } catch (err) {
      console.error('Failed to create offer:', err)
    }
  }

  async function handleSdpOffer(from: string, sdp: RTCSessionDescriptionInit) {
    try {
      const answer = await webrtc.handleOffer(from, sdp)
      signaling.send({ type: 'sdp_answer', target: from, sdp: answer })
    } catch (err) {
      console.error('Failed to handle offer:', err)
    }
  }

  // === Encryption Handshake ===

  function flushPendingFiles(peerId: string) {
    const dc = webrtc.getDataChannel(peerId)
    if (!dc || dc.readyState !== 'open') return

    const cs = cryptoServices.get(peerId)
    if (encryptionEnabled.value && !cs?.isReady) return

    const pending = peerPendingFiles.get(peerId)
    if (pending && pending.length > 0) {
      if (import.meta.env.DEV) console.log('[Crypto] Flushing pending files for', peerId, ':', pending.length)
      peerPendingFiles.set(peerId, [])
      for (const file of pending) {
        sendFileToPeer(peerId, file)
      }
    }
  }

  async function startCryptoHandshake(peerId: string) {
    if (!encryptionEnabled.value) return
    if (cryptoServices.has(peerId)) return
    if (import.meta.env.DEV) console.log('[Crypto] Starting handshake for', peerId)
    try {
      const cs = new CryptoService()
      const publicKey = await cs.generateKeyPair()
      if (!cryptoServices.has(peerId)) {
        cryptoServices.set(peerId, cs)
      }
      webrtc.sendTo(peerId, JSON.stringify({
        type: 'crypto_handshake',
        publicKey: arrayBufferToBase64(publicKey),
      }))
    } catch (err) {
      console.error('[Crypto] Handshake initiation failed:', err)
    }
  }

  async function handleCryptoHandshake(peerId: string, msg: { publicKey: string }) {
    if (!encryptionEnabled.value) return
    if (import.meta.env.DEV) console.log('[Crypto] Received handshake from', peerId)
    try {
      const peerPublicKey = base64ToArrayBuffer(msg.publicKey)

      let cs = cryptoServices.get(peerId)
      if (!cs) {
        cs = new CryptoService()
        cryptoServices.set(peerId, cs)
      }

      const ourPublicKey = await cs.deriveFromPeer(peerPublicKey)
      if (ourPublicKey) {
        // We generated keys and need to respond
        webrtc.sendTo(peerId, JSON.stringify({
          type: 'crypto_handshake',
          publicKey: arrayBufferToBase64(ourPublicKey),
        }))
      }

      if (import.meta.env.DEV) console.log('[Crypto] Handshake complete for', peerId)
      flushPendingFiles(peerId)
    } catch (err) {
      console.error('[Crypto] Handshake failed:', err)
    }
  }

  // === File Transfer ===
  function sendFileToPeer(peerId: string, file: File) {
    const dc = webrtc.getDataChannel(peerId)
    if (import.meta.env.DEV) console.log('[Send] sendFileToPeer', peerId, 'dc state:', dc?.readyState)
    if (!dc || dc.readyState !== 'open') {
      if (import.meta.env.DEV) console.log('[Send] DataChannel not open, queuing file for', peerId)
      const pending = peerPendingFiles.get(peerId) || []
      pending.push(file)
      peerPendingFiles.set(peerId, pending)
      return
    }

    const cs = cryptoServices.get(peerId)
    if (encryptionEnabled.value && !cs?.isReady) {
      if (import.meta.env.DEV) console.log('[Send] Crypto not ready, queuing file for', peerId)
      const pending = peerPendingFiles.get(peerId) || []
      pending.push(file)
      peerPendingFiles.set(peerId, pending)
      return
    }

    const fileId = generateId()
    const chunks = FileChunker.chunk(file, FileChunker.DEFAULT_CHUNK_SIZE, fileId)

    const transferId = transferStore.addTransfer({
      fileId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks: chunks.length,
      receivedBytes: 0,
      status: 'transferring',
      direction: 'send',
      peerId,
      connectionMode: 'unknown',
    })

    // Send file metadata
    webrtc.sendTo(peerId, JSON.stringify({
      type: 'file_meta',
      fileId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks: chunks.length,
      chunkSize: FileChunker.DEFAULT_CHUNK_SIZE,
    } as FileMetaMessage))

    // Send chunks with flow control
    sendChunks(peerId, chunks, transferId)
  }

  const BUFFER_HIGH = 512 * 1024 // 512KB
  const BUFFER_LOW = 128 * 1024  // 128KB

  async function sendChunks(peerId: string, chunks: ReturnType<typeof FileChunker.chunk>, transferId: string) {
    const dc = webrtc.getDataChannel(peerId)
    if (import.meta.env.DEV) console.log('[Send] sendChunks start, peer:', peerId, 'chunks:', chunks.length)
    if (!dc) {
      transferStore.setStatus(transferId, 'failed')
      return
    }

    let sentBytes = 0

    for (const chunk of chunks) {
      // Pause check
      const t = transferStore.getTransfer(transferId)
      if (!t || t.status === 'cancelled') break

      if (t.status === 'paused') {
        await waitForResume(transferId)
      }

      // Flow control: wait if buffer is too full
      if (dc.bufferedAmount > BUFFER_HIGH) {
        await new Promise<void>(resolve => {
          dc.addEventListener('bufferedamountlow', () => resolve(), { once: true })
        })
      }

      const data = new Uint8Array(await chunk.data.arrayBuffer())
      const encoded = FileChunker.encodeChunk({ ...chunk, data })

      const cs = encryptionEnabled.value ? cryptoServices.get(peerId) : undefined
      const toSend = cs ? await cs.encrypt(encoded) : encoded
      dc.send(toSend)
      sentBytes += chunk.data.size
      transferStore.updateProgress(transferId, sentBytes)
    }

    // Check final status before sending complete
    if (import.meta.env.DEV) console.log('[Send] sendChunks done, sentBytes:', sentBytes)
    const finalT = transferStore.getTransfer(transferId)
    if (finalT && finalT.status !== 'cancelled') {
      transferStore.updateProgress(transferId, finalT.fileSize)
      transferStore.setStatus(transferId, 'complete')
      webrtc.sendTo(peerId, JSON.stringify({
        type: 'transfer_complete',
        fileId: chunks[0].fileId,
        totalBytes: sentBytes,
      }))
    }
  }

  function waitForResume(transferId: string): Promise<void> {
    return new Promise(resolve => {
      const check = setInterval(() => {
        const t = transferStore.getTransfer(transferId)
        if (!t || t.status === 'cancelled') {
          clearInterval(check)
          resolve()
        } else if (t.status !== 'paused') {
          clearInterval(check)
          resolve()
        }
      }, 200)
    })
  }

  // === Handle received DataChannel messages ===
  function handleDataChannelMessage(peerId: string, data: string | ArrayBuffer) {
    if (typeof data === 'string') {
      const msg = JSON.parse(data)
      switch (msg.type) {
        case 'crypto_handshake':
          handleCryptoHandshake(peerId, msg)
          break
        case 'file_meta':
          handleFileMeta(peerId, msg)
          break
        case 'transfer_complete':
          handleTransferComplete(msg.fileId)
          break
        case 'transfer_pause':
          handleTransferControl(msg.fileId, 'paused')
          break
        case 'transfer_resume':
          handleTransferControl(msg.fileId, 'transferring')
          break
        case 'transfer_cancel':
          handleTransferControl(msg.fileId, 'cancelled')
          break
        case 'transfer_ack':
          handleTransferComplete(msg.fileId)
          break
      }
    } else {
      // Binary chunk
      handleChunk(peerId, data as ArrayBuffer)
    }
  }

  function handleFileMeta(peerId: string, meta: FileMetaMessage) {
    if (import.meta.env.DEV) console.log('[Receive] file_meta', meta.fileId, meta.fileName, 'chunks:', meta.totalChunks)
    fileAssembler.addMeta(meta)
    transferStore.addTransfer({
      fileId: meta.fileId,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      mimeType: meta.mimeType,
      totalChunks: meta.totalChunks,
      receivedBytes: 0,
      status: 'transferring',
      direction: 'receive',
      peerId,
      connectionMode: 'unknown',
    })

    webrtc.sendTo(peerId, JSON.stringify({
      type: 'transfer_ready',
      fileId: meta.fileId,
    }))
  }

  async function handleChunk(peerId: string, buffer: ArrayBuffer) {
    try {
      // Decrypt
      const cs = encryptionEnabled.value ? cryptoServices.get(peerId) : undefined
      const decrypted = cs ? await cs.decrypt(buffer) : buffer

      const header = FileChunker.decodeChunkHeader(decrypted)
      const chunkData = new Uint8Array(decrypted, 24)
      if (import.meta.env.DEV) console.log('[Receive] chunk', header.fileId, 'index:', header.chunkIndex, '/', header.totalChunks, 'size:', chunkData.length)
      const complete = fileAssembler.addChunk(header.fileId, header.chunkIndex, header.totalChunks, chunkData)

      // Update progress with actual received bytes
      const prev = receivedBytesTracker.get(header.fileId) || 0
      const next = prev + chunkData.length
      receivedBytesTracker.set(header.fileId, next)
      transferStore.updateProgress(findTransferId(header.fileId), next)

      if (complete) {
        if (import.meta.env.DEV) console.log('[Receive] All chunks received, assembling:', header.fileId)
        try {
          const blob = fileAssembler.assemble(header.fileId)
          receivedFiles.set(header.fileId, blob)
          if (import.meta.env.DEV) console.log('[Receive] File assembled:', header.fileId, 'size:', blob.size)

          // Normalize to exact file size on completion
          const meta = fileAssembler.getMeta(header.fileId)
          if (meta) {
            transferStore.updateProgress(findTransferId(header.fileId), meta.fileSize)
          }
          transferStore.setStatus(findTransferId(header.fileId), 'complete')
          webrtc.sendTo(peerId, JSON.stringify({
            type: 'transfer_ack',
            fileId: header.fileId,
            receivedBytes: blob.size,
            status: 'ok',
          }))
        } catch (err) {
          transferStore.setStatus(findTransferId(header.fileId), 'failed')
        }
      }
    } catch (err) {
      console.error('[Receive] Chunk processing failed:', err)
    }
  }

  function handleTransferComplete(fileId: string) {
    const transferId = findTransferId(fileId)
    const t = transferStore.getTransfer(transferId)
    if (t) {
      transferStore.updateProgress(transferId, t.fileSize)
    }
    transferStore.setStatus(transferId, 'complete')
  }

  function handleTransferControl(fileId: string, status: 'paused' | 'transferring' | 'cancelled') {
    transferStore.setStatus(findTransferId(fileId), status)
  }

  function findTransferId(fileId: string): string {
    const transfer = transferStore.transfers.find(t => t.fileId === fileId)
    return transfer?.id || ''
  }

  // === Public API ===
  function createRoom(displayName: string, avatarColor: string) {
    store.setRoomState('creating')
    peerPendingFiles.clear()
    signaling.send({ type: 'create_room', displayName, avatarColor })
  }

  function joinRoom(code: string, displayName: string, avatarColor: string) {
    store.setRoomState('joining')
    signaling.send({ type: 'join_room', roomCode: code.toUpperCase(), displayName, avatarColor })
  }

  function leaveRoom() {
    signaling.send({ type: 'leave_room' })
    webrtc.disconnectAll()
    cryptoServices.clear()
    store.reset()
    router.push('/')
  }

  function sendFiles(files: File[]) {
    const peerIds = store.peers.map(p => p.id)
    for (const peerId of peerIds) {
      for (const file of files) {
        sendFileToPeer(peerId, file)
      }
    }
  }

  function pauseTransfer(transferId: string) {
    transferStore.setStatus(transferId, 'paused')
    const t = transferStore.getTransfer(transferId)
    if (t) {
      webrtc.sendTo(t.peerId, JSON.stringify({ type: 'transfer_pause', fileId: t.fileId }))
    }
  }

  function resumeTransfer(transferId: string) {
    transferStore.setStatus(transferId, 'transferring')
    const t = transferStore.getTransfer(transferId)
    if (t) {
      webrtc.sendTo(t.peerId, JSON.stringify({ type: 'transfer_resume', fileId: t.fileId }))
    }
  }

  function cancelTransfer(transferId: string) {
    transferStore.setStatus(transferId, 'cancelled')
    const t = transferStore.getTransfer(transferId)
    if (t) {
      webrtc.sendTo(t.peerId, JSON.stringify({ type: 'transfer_cancel', fileId: t.fileId }))
    }
  }

  function toggleEncryption() {
    if (!cryptoAvailable) return
    encryptionEnabled.value = !encryptionEnabled.value
  }

  function downloadReceivedFile(transferId: string) {
    const t = transferStore.getTransfer(transferId)
    if (!t || t.direction !== 'receive') return
    const blob = receivedFiles.get(t.fileId)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = t.fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  onUnmounted(() => {
    signaling.disconnect()
    webrtc.disconnectAll()
  })

  return {
    isConnected,
    store,
    transferStore,
    encryptionEnabled,
    cryptoAvailable,
    toggleEncryption,
    createRoom,
    joinRoom,
    leaveRoom,
    sendFiles,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    downloadReceivedFile,
  }
}

// Inline type for DataChannel control messages
interface FileMetaMessage extends FileMeta {
  type: 'file_meta'
}
