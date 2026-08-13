/**
 * Hardware-inspired lookup table implementation of CRC32C (Castagnoli)
 * Polynomial: 0x82F63B78
 */
export declare function crc32c(data: Uint8Array, seed?: number): number;
