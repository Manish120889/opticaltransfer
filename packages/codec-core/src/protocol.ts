import { crc32c } from './crc32c.js';

export type TransmissionMode = 'safe' | 'fast' | 'turbo';

export interface CodecProfile {
  mode: TransmissionMode;
  gridCols: number;
  gridRows: number;
  palette: string[];
  bitsPerTile: number;
  fecParityRatio: number;
  targetFPS: number;
  blockSize: number;
}

export const TRANSMISSION_PROFILES: Record<TransmissionMode, CodecProfile> = {
  safe: {
    mode: 'safe',
    gridCols: 24,
    gridRows: 24,
    palette: ['#000000', '#FFFFFF', '#FF0000', '#00FFFF'],
    bitsPerTile: 2,
    fecParityRatio: 0.25,
    targetFPS: 15,
    blockSize: 64
  },
  fast: {
    mode: 'fast',
    gridCols: 36,
    gridRows: 36,
    palette: [
      '#000000', '#FFFFFF', '#FF0000', '#00FF00',
      '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF',
      '#FF8000', '#8000FF', '#00FF80', '#FF0080',
      '#80FF00', '#0080FF', '#808080', '#C0C0C0'
    ],
    bitsPerTile: 4,
    fecParityRatio: 0.15,
    targetFPS: 30,
    blockSize: 128
  },
  turbo: {
    mode: 'turbo',
    gridCols: 48,
    gridRows: 48,
    palette: generate64ColorPalette(),
    bitsPerTile: 6,
    fecParityRatio: 0.10,
    targetFPS: 45,
    blockSize: 192
  }
};

function generate64ColorPalette(): string[] {
  const colors: string[] = [];
  const steps = [0, 85, 170, 255];
  for (const r of steps) {
    for (const g of steps) {
      for (const b of steps) {
        colors.push(`rgb(${r},${g},${b})`);
      }
    }
  }
  return colors.slice(0, 64);
}

export interface ManifestHeader {
  transferId: number;
  originalSize: number;
  compressedSize: number;
  compressed: boolean;
  encrypted: boolean;
  salt: Uint8Array;
  iv: Uint8Array;
  totalSourceBlocks: number;
  blockSize: number;
  sha256Hash: string;
  mimeType: string;
  fileName: string;
}

export function serializeManifestHeader(manifest: ManifestHeader): Uint8Array {
  const encoder = new TextEncoder();
  const mimeBytes = encoder.encode(manifest.mimeType);
  const nameBytes = encoder.encode(manifest.fileName);
  const hashBytes = hexToBytes(manifest.sha256Hash);

  const length = 4 + 2 + 4 + 4 + 1 + 1 + 16 + 12 + 2 + 2 + 32 + 1 + mimeBytes.length + 1 + nameBytes.length;
  const buffer = new Uint8Array(length);
  const view = new DataView(buffer.buffer);

  let offset = 0;
  view.setUint32(offset, 0x4F505449, false); offset += 4;
  view.setUint16(offset, manifest.transferId, false); offset += 2;
  view.setUint32(offset, manifest.originalSize, false); offset += 4;
  view.setUint32(offset, manifest.compressedSize, false); offset += 4;
  buffer[offset++] = manifest.compressed ? 1 : 0;
  buffer[offset++] = manifest.encrypted ? 1 : 0;
  
  buffer.set(manifest.salt, offset); offset += 16;
  buffer.set(manifest.iv, offset); offset += 12;

  view.setUint16(offset, manifest.totalSourceBlocks, false); offset += 2;
  view.setUint16(offset, manifest.blockSize, false); offset += 2;

  buffer.set(hashBytes, offset); offset += 32;

  buffer[offset++] = mimeBytes.length;
  buffer.set(mimeBytes, offset); offset += mimeBytes.length;

  buffer[offset++] = nameBytes.length;
  buffer.set(nameBytes, offset);

  return buffer;
}

export function deserializeManifestHeader(buffer: Uint8Array): ManifestHeader | null {
  if (buffer.length < 80) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 0;
  const magic = view.getUint32(offset, false); offset += 4;
  if (magic !== 0x4F505449) return null;

  const transferId = view.getUint16(offset, false); offset += 2;
  const originalSize = view.getUint32(offset, false); offset += 4;
  const compressedSize = view.getUint32(offset, false); offset += 4;
  const compressed = buffer[offset++] === 1;
  const encrypted = buffer[offset++] === 1;

  const salt = buffer.slice(offset, offset + 16); offset += 16;
  const iv = buffer.slice(offset, offset + 12); offset += 12;

  const totalSourceBlocks = view.getUint16(offset, false); offset += 2;
  const blockSize = view.getUint16(offset, false); offset += 2;

  const hashBytes = buffer.slice(offset, offset + 32); offset += 32;
  const sha256Hash = bytesToHex(hashBytes);

  if (offset >= buffer.length) return null;
  const mimeLen = buffer[offset++];
  if (offset + mimeLen > buffer.length) return null;
  const mimeType = new TextDecoder().decode(buffer.slice(offset, offset + mimeLen)); offset += mimeLen;

  if (offset >= buffer.length) return null;
  const nameLen = buffer[offset++];
  if (offset + nameLen > buffer.length) return null;
  const fileName = new TextDecoder().decode(buffer.slice(offset, offset + nameLen));

  return {
    transferId,
    originalSize,
    compressedSize,
    compressed,
    encrypted,
    salt,
    iv,
    totalSourceBlocks,
    blockSize,
    sha256Hash,
    mimeType,
    fileName
  };
}

export function packBitsToColorIndices(bits: Uint8Array, bitsPerTile: number, totalTiles: number): number[] {
  const indices: number[] = new Array(totalTiles).fill(0);
  let bitPos = 0;
  const totalBits = bits.length * 8;

  for (let i = 0; i < totalTiles; i++) {
    let val = 0;
    for (let b = 0; b < bitsPerTile; b++) {
      const currentBitIdx = bitPos + b;
      if (currentBitIdx < totalBits) {
        const byteIdx = Math.floor(currentBitIdx / 8);
        const bitOffset = currentBitIdx % 8;
        const bit = (bits[byteIdx] >> (7 - bitOffset)) & 1;
        val = (val << 1) | bit;
      }
    }
    indices[i] = val;
    bitPos += bitsPerTile;
  }

  return indices;
}

export function unpackColorIndicesToBits(indices: number[], bitsPerTile: number, expectedByteCount: number): Uint8Array {
  const result = new Uint8Array(expectedByteCount);
  let bitPos = 0;

  for (const idx of indices) {
    for (let b = bitsPerTile - 1; b >= 0; b--) {
      const bit = (idx >> b) & 1;
      const byteIdx = Math.floor(bitPos / 8);
      const bitOffset = bitPos % 8;
      if (byteIdx < expectedByteCount) {
        result[byteIdx] |= (bit << (7 - bitOffset));
      }
      bitPos++;
    }
  }

  return result;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
