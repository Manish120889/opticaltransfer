# Optical-Only File Container Specification (v1.0)

## Overview
This document specifies the binary format and manifest structure for streaming file payloads over visible light screen-to-camera transmission channels.

---

## 1. Pipeline Stages
```
[ Raw File ]
     │
     ▼
[ Lossless Compression Engine (zstd/Brotli/LZ) ]  (Bypassed for ZIP/MP4/JPEG/etc.)
     │
     ▼
[ Optional AES-256-GCM Encryption ]
     │
     ▼
[ SHA-256 Payload Hash Generation ]
     │
     ▼
[ Manifest Header Packaging ]
     │
     ▼
[ Source Block Partitioning ]
     │
     ▼
[ Outer Fountain Code Engine (Luby Transform) ]
     │
     ▼
[ Visual Frame Packaging & Rendering ]
```

---

## 2. Manifest Header Format
The initial transmission phase broadcasts Frame Type `0` (Manifest Header) containing binary metadata serialized as follows:

| Field Name | Type | Size (Bytes) | Description |
|---|---|---|---|
| `magic` | `uint32` | 4 | Magic byte header (`0x4F505449` -> "OPTI") |
| `transferId` | `uint16` | 2 | Unique random session identifier |
| `originalSize` | `uint32` | 4 | Uncompressed original file size in bytes |
| `compressedSize` | `uint32` | 4 | Compressed payload size in bytes |
| `compressionType` | `uint8` | 1 | `0` = None, `1` = LZ/zstd, `2` = Brotli |
| `encryptionFlag` | `uint8` | 1 | `0` = Unencrypted, `1` = AES-256-GCM |
| `salt` | `uint8[16]` | 16 | PBKDF2 salt (if encrypted) |
| `iv` | `uint8[12]` | 12 | AES-GCM Initialization Vector (if encrypted) |
| `totalSourceBlocks` | `uint16` | 2 | Number of source blocks $K$ |
| `blockSize` | `uint16` | 2 | Size of each payload source block in bytes |
| `sha256Hash` | `uint8[32]` | 32 | SHA-256 digest of original uncompressed file |
| `mimeTypeLength` | `uint8` | 1 | Length $M$ of MIME type string |
| `mimeType` | `string` | $M$ | UTF-8 encoded MIME type string |
| `fileNameLength` | `uint8` | 1 | Length $N$ of file name string |
| `fileName` | `string` | $N$ | UTF-8 encoded file name string |

---

## 3. Source Block Partitioning
- Payload (compressed + encrypted) is partitioned into $K$ source blocks of equal length $S$ (e.g. 64 to 256 bytes per block).
- If the final block is shorter than $S$, it is padded with `0x00` bytes. The original size in the manifest ensures exact byte truncation upon assembly.

---

## 4. Fountain Payload Packets
After the receiver captures the Manifest Header, the sender streams Frame Type `1` (Fountain Payload Data Packet):

| Field Name | Type | Size | Description |
|---|---|---|---|
| `transferId` | `uint16` | 2 | Session transfer ID |
| `seed` | `uint32` | 4 | PRNG seed used for degree distribution & block sampling |
| `degree` | `uint16` | 2 | Number of source blocks XORed in this fountain packet |
| `data` | `uint8[S]` | $S$ | Payload bytes resulting from XORing $d$ source blocks |
