/**
 * Cryptographic SHA-256 implementation with Web Crypto API and fallback
 */
export declare function computeSHA256(data: Uint8Array): Promise<string>;
export declare function syncSHA256Hex(data: Uint8Array): string;
