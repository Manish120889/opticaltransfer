/**
 * Lossless Compression Engine with File Extension Auto-Detection
 */
export interface CompressionResult {
    data: Uint8Array;
    compressed: boolean;
    algorithm: 'none' | 'lz';
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
}
export declare function shouldCompressFile(fileName: string, mimeType: string): boolean;
/**
 * Fast Run-Length & LZ77 hybrid dictionary compression engine for binary/text data
 */
export declare function compressData(input: Uint8Array): Uint8Array;
export declare function decompressData(input: Uint8Array): Uint8Array;
export declare function processFileCompression(input: Uint8Array, fileName: string, mimeType: string): CompressionResult;
