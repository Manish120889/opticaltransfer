/**
 * Lossless Compression Engine with File Extension Auto-Detection
 */

const PRECOMPRESSED_EXTENSIONS = new Set([
  'zip', 'gz', 'bz2', '7z', 'rar', 'tar',
  'jpg', 'jpeg', 'png', 'gif', 'heic', 'webp',
  'mp4', 'mov', 'avi', 'mkv', 'webm',
  'mp3', 'aac', 'flac', 'ogg', 'wav',
  'pdf'
]);

export interface CompressionResult {
  data: Uint8Array;
  compressed: boolean;
  algorithm: 'none' | 'lz';
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export function shouldCompressFile(fileName: string, mimeType: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (PRECOMPRESSED_EXTENSIONS.has(ext)) return false;
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
    return false;
  }
  return true;
}

/**
 * Fast Run-Length & LZ77 hybrid dictionary compression engine for binary/text data
 */
export function compressData(input: Uint8Array): Uint8Array {
  const output: number[] = [];
  let pos = 0;

  while (pos < input.length) {
    let matchLen = 0;
    let matchOffset = 0;

    // Search back up to 255 bytes for identical sequence
    const searchStart = Math.max(0, pos - 255);
    for (let j = searchStart; j < pos; j++) {
      let l = 0;
      while (pos + l < input.length && input[j + l] === input[pos + l] && l < 255) {
        l++;
      }
      if (l > matchLen) {
        matchLen = l;
        matchOffset = pos - j;
      }
    }

    if (matchLen >= 3) {
      // Flag token: 0xFF, offset, length
      output.push(0xFF, matchOffset, matchLen);
      pos += matchLen;
    } else {
      if (input[pos] === 0xFF) {
        // Escape byte
        output.push(0xFF, 0, 1);
      } else {
        output.push(input[pos]);
      }
      pos++;
    }
  }

  return new Uint8Array(output);
}

export function decompressData(input: Uint8Array): Uint8Array {
  const output: number[] = [];
  let pos = 0;

  while (pos < input.length) {
    if (input[pos] === 0xFF) {
      pos++;
      if (pos >= input.length) break;
      const offset = input[pos++];
      const len = input[pos++];
      
      if (offset === 0 && len === 1) {
        output.push(0xFF);
      } else {
        const start = output.length - offset;
        for (let i = 0; i < len; i++) {
          output.push(output[start + i]);
        }
      }
    } else {
      output.push(input[pos++]);
    }
  }

  return new Uint8Array(output);
}

export function processFileCompression(input: Uint8Array, fileName: string, mimeType: string): CompressionResult {
  const originalSize = input.length;
  if (!shouldCompressFile(fileName, mimeType)) {
    return {
      data: input,
      compressed: false,
      algorithm: 'none',
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1.0
    };
  }

  const compressed = compressData(input);
  if (compressed.length < originalSize) {
    return {
      data: compressed,
      compressed: true,
      algorithm: 'lz',
      originalSize,
      compressedSize: compressed.length,
      compressionRatio: originalSize / compressed.length
    };
  }

  return {
    data: input,
    compressed: false,
    algorithm: 'none',
    originalSize,
    compressedSize: originalSize,
    compressionRatio: 1.0
  };
}
