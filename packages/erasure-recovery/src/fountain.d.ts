export interface FountainPacket {
    seed: number;
    degree: number;
    blockIndices: number[];
    data: Uint8Array;
}
export declare function generateRobustSolitonDistribution(K: number, c?: number, delta?: number): number[];
export declare class FountainEncoder {
    readonly K: number;
    readonly blockSize: number;
    private readonly sourceBlocks;
    private readonly cdf;
    private currentSeed;
    constructor(payload: Uint8Array, blockSize?: number);
    generatePacket(specifiedSeed?: number): FountainPacket;
}
export declare class FountainDecoder {
    readonly K: number;
    readonly blockSize: number;
    readonly originalSize: number;
    private readonly decodedBlocks;
    private readonly cdf;
    private decodedCount;
    private receivedPacketsCount;
    private equations;
    constructor(K: number, blockSize: number, originalSize: number);
    getDecodedBlocksCount(): number;
    getReceivedPacketsCount(): number;
    getProgress(): number;
    isComplete(): boolean;
    addPacket(packet: FountainPacket): boolean;
    private solveBeliefPropagation;
    assemblePayload(): Uint8Array | null;
}
