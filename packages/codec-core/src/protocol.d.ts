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
export declare const TRANSMISSION_PROFILES: Record<TransmissionMode, CodecProfile>;
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
export declare function serializeManifestHeader(manifest: ManifestHeader): Uint8Array;
export declare function deserializeManifestHeader(buffer: Uint8Array): ManifestHeader | null;
export declare function packBitsToColorIndices(bits: Uint8Array, bitsPerTile: number, totalTiles: number): number[];
export declare function unpackColorIndicesToBits(indices: number[], bitsPerTile: number, expectedByteCount: number): Uint8Array;
