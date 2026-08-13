# Security & Integrity Specification (v1.0)

## Overview
This document specifies the cryptographic protection mechanisms, session fingerprinting, warning models, and integrity verification rules for optical air-gapped file transfers.

---

## 1. Zero-Network Security Model
- **No Network Payload Channel**: Data transfer relies solely on visible optical emissions from a screen to a camera sensor.
- **Air-Gap Verification**: No socket, HTTP, WebRTC, Bluetooth, or cellular connections are initialized.
- **Visual Eavesdropping Warning**: Optical line-of-sight is inherently visible. Anyone with visual access to the sending screen or camera line-of-sight can theoretically record the transmitted frame sequence.
- **Mandatory Encryption for Sensitive Data**: For sensitive files, client-side encryption MUST be enabled.

---

## 2. Cryptographic Architecture

### Client-Side Encryption (AES-256-GCM)
When enabled by the sender:
1. **Passphrase KDF**: PBKDF2 with HMAC-SHA256, 100,000 iterations, 16-byte random salt.
2. **Key Size**: 256-bit symmetric AES key derived from passphrase.
3. **Initialization Vector (IV)**: 12-byte cryptographically secure random IV generated per transfer session.
4. **Authentication Tag**: 128-bit GCM authentication tag appended to the ciphertext.
5. **Decryption**: Receiver prompts for passphrase upon manifest decoding, derives the key using salt, and decrypts payload before writing output file.

---

## 3. Session Fingerprint & Anti-Spoofing
- Both Sender and Receiver calculate a 4-character visual session fingerprint derived from `SHA-256(transferId + fileName + originalSize)`:
  - Displayed as a distinct visual badge (e.g. `#A4F9 - Cyan Phoenix`) on both sender canvas and receiver HUD overlay.
- Users can visually compare the short fingerprint to ensure the camera is tracking the intended sender screen and not a neighboring or spoofed display.

---

## 4. End-to-End File Integrity Verification
- **SHA-256 Hash Digest**: Prior to encoding, the sender computes the full SHA-256 cryptographic digest of the raw, uncompressed input file.
- **Verification Step**: Upon completing fountain decoding and decryption, the receiver calculates SHA-256 over the final assembled bytes.
- **Match Check**:
  - `SHA256(AssembledBytes) == Manifest.sha256Hash` -> Success ✅
  - Mismatch -> Error ❌ (Payload discarded, security warning flagged).
