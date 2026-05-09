import { createSignalingServer } from './SignalingServer'

const PORT = parseInt(process.env.SIGNALING_PORT || '7766', 10)

createSignalingServer(PORT)
