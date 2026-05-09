const ECDH_CURVE = 'P-256'
const HKDF_HASH = 'SHA-256'
const AES_KEY_LENGTH = 256
const IV_LENGTH = 12
const HANDSHAKE_TIMEOUT = 30_000

export class CryptoService {
  private aesKey: CryptoKey | null = null
  private ready_ = false
  private keyPair: CryptoKeyPair | null = null

  get isReady(): boolean {
    return this.ready_
  }

  /** Generate ECDH key pair, export public key as raw bytes (65 bytes uncompressed). */
  async generateKeyPair(): Promise<ArrayBuffer> {
    this.keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: ECDH_CURVE },
      true,
      ['deriveBits'],
    )
    return crypto.subtle.exportKey('raw', this.keyPair.publicKey)
  }

  /** Import peer's public key bytes and derive the AES-GCM shared key. Returns our public key only if keys were just generated (answerer side), null otherwise. */
  async deriveFromPeer(peerPublicKeyRaw: ArrayBuffer): Promise<ArrayBuffer | null> {
    const peerPublicKey = await crypto.subtle.importKey(
      'raw',
      peerPublicKeyRaw,
      { name: 'ECDH', namedCurve: ECDH_CURVE },
      false,
      [],
    )

    const isNewKeyPair = !this.keyPair
    if (isNewKeyPair) {
      await this.generateKeyPair()
    }

    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerPublicKey },
      this.keyPair!.privateKey,
      256,
    )

    const hkdfKey = await crypto.subtle.importKey(
      'raw',
      sharedBits,
      { name: 'HKDF' },
      false,
      ['deriveKey'],
    )

    this.aesKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: HKDF_HASH,
        salt: new Uint8Array(0),
        info: new TextEncoder().encode('filebeam-e2e'),
      },
      hkdfKey,
      { name: 'AES-GCM', length: AES_KEY_LENGTH },
      false,
      ['encrypt', 'decrypt'],
    )

    this.ready_ = true

    // Only return our public key if we just generated it (answerer responding to offerer)
    return isNewKeyPair
      ? crypto.subtle.exportKey('raw', this.keyPair!.publicKey)
      : null
  }

  /** Encrypt data. Result: [12B IV][AES-GCM ciphertext + 16B tag]. */
  async encrypt(plaintext: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.aesKey) throw new Error('Encryption key not ready')
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.aesKey,
      plaintext,
    )
    const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
    result.set(iv, 0)
    result.set(new Uint8Array(ciphertext), IV_LENGTH)
    return result.buffer
  }

  /** Decrypt data formatted as [12B IV][AES-GCM ciphertext + 16B tag]. */
  async decrypt(data: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.aesKey) throw new Error('Encryption key not ready')
    const iv = new Uint8Array(data, 0, IV_LENGTH)
    const ciphertext = new Uint8Array(data, IV_LENGTH)
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      this.aesKey,
      ciphertext,
    )
  }
}
