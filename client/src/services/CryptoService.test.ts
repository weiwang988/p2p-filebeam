import { describe, it, expect } from 'vitest'
import { CryptoService } from './CryptoService'

describe('CryptoService', () => {
  it('generates a key pair and exports public key as 65 bytes', async () => {
    const cs = new CryptoService()
    const pubKey = await cs.generateKeyPair()

    expect(pubKey.byteLength).toBe(65) // P-256 uncompressed
    expect(cs.isReady).toBe(false)
  })

  it('completes handshake between two parties', async () => {
    const alice = new CryptoService()
    const bob = new CryptoService()

    // Alice generates key pair first (offerer)
    const alicePubKey = await alice.generateKeyPair()
    expect(alice.isReady).toBe(false)

    // Bob receives Alice's key, derives shared key, returns his public key
    const bobPubKey = await bob.deriveFromPeer(alicePubKey)
    expect(bob.isReady).toBe(true)
    expect(bobPubKey!.byteLength).toBe(65)

    // Alice receives Bob's key, derives shared key
    const aliceResponse = await alice.deriveFromPeer(bobPubKey!)
    expect(alice.isReady).toBe(true)
    // Alice already has keys, so should NOT return her public key again
    expect(aliceResponse).toBeNull()
  })

  it('encrypts and decrypts correctly after handshake', async () => {
    const alice = new CryptoService()
    const bob = new CryptoService()

    // Handshake
    const alicePubKey = await alice.generateKeyPair()
    const bobPubKey = await bob.deriveFromPeer(alicePubKey)
    await alice.deriveFromPeer(bobPubKey!)

    // Encrypt on Alice side
    const plaintext = new TextEncoder().encode('Hello, secure world!')
    const encrypted = await alice.encrypt(plaintext.buffer)

    // IV (12) + plaintext (20) + auth tag (16) = 48
    expect(encrypted.byteLength).toBe(48)

    // Decrypt on Bob side
    const decrypted = await bob.decrypt(encrypted)
    const decryptedText = new TextDecoder().decode(decrypted)
    expect(decryptedText).toBe('Hello, secure world!')
  })

  it('throws when encrypting before handshake completes', async () => {
    const cs = new CryptoService()
    const data = new TextEncoder().encode('test')
    await expect(cs.encrypt(data.buffer)).rejects.toThrow('Encryption key not ready')
  })

  it('throws when decrypting before handshake completes', async () => {
    const cs = new CryptoService()
    const data = new Uint8Array(28) // 12B IV + 16B tag minimum
    await expect(cs.decrypt(data.buffer)).rejects.toThrow('Encryption key not ready')
  })

  it('does not return public key when deriveFromPeer called with existing keys', async () => {
    const cs = new CryptoService()

    // First call with a peer's key — generates own keys, returns own public key
    const peerKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    )
    const peerPubKey = await crypto.subtle.exportKey('raw', peerKeyPair.publicKey)

    const firstResult = await cs.deriveFromPeer(peerPubKey)
    expect(firstResult).not.toBeNull()
    expect(cs.isReady).toBe(true)

    // Second call with a different peer key — should NOT return public key
    const anotherPeerKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    )
    const anotherPubKey = await crypto.subtle.exportKey('raw', anotherPeerKeyPair.publicKey)

    const secondResult = await cs.deriveFromPeer(anotherPubKey)
    expect(secondResult).toBeNull()
  })
})
