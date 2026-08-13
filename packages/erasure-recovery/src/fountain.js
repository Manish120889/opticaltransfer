class SeededRandom {
    state;
    constructor(seed) {
        this.state = seed >>> 0;
    }
    nextFloat() {
        this.state = (this.state * 1664525 + 1013904223) >>> 0;
        return this.state / 4294967296;
    }
    nextInt(max) {
        return Math.floor(this.nextFloat() * max);
    }
}
export function generateRobustSolitonDistribution(K, c = 0.1, delta = 0.05) {
    const probs = new Float64Array(K + 1);
    probs[1] = 1.0 / K;
    for (let i = 2; i <= K; i++) {
        probs[i] = 1.0 / (i * (i - 1));
    }
    const S = c * Math.log(K / delta) * Math.sqrt(K);
    const R_limit = Math.floor(K / S);
    for (let i = 1; i <= K; i++) {
        if (i < R_limit) {
            probs[i] += S / (K * i);
        }
        else if (i === R_limit) {
            probs[i] += (S * Math.log(S / delta)) / K;
        }
    }
    let sum = 0;
    for (let i = 1; i <= K; i++)
        sum += probs[i];
    const cdf = new Array(K + 1);
    let acc = 0;
    for (let i = 1; i <= K; i++) {
        acc += probs[i] / sum;
        cdf[i] = acc;
    }
    cdf[K] = 1.0;
    return cdf;
}
export class FountainEncoder {
    K;
    blockSize;
    sourceBlocks;
    cdf;
    currentSeed = 1;
    constructor(payload, blockSize = 128) {
        this.blockSize = blockSize;
        this.K = Math.ceil(payload.length / blockSize);
        this.sourceBlocks = new Array(this.K);
        this.cdf = generateRobustSolitonDistribution(this.K);
        for (let i = 0; i < this.K; i++) {
            const block = new Uint8Array(blockSize);
            const start = i * blockSize;
            const end = Math.min(payload.length, start + blockSize);
            block.set(payload.subarray(start, end));
            this.sourceBlocks[i] = block;
        }
    }
    generatePacket(specifiedSeed) {
        const seed = specifiedSeed !== undefined ? specifiedSeed : (this.currentSeed++ >>> 0);
        // First K packets are systematic degree-1 packets for instant dropless decoding
        let blockIndices;
        let degree;
        if (seed <= this.K) {
            degree = 1;
            blockIndices = [seed - 1];
        }
        else {
            const rng = new SeededRandom(seed);
            const rand = rng.nextFloat();
            degree = 1;
            for (let i = 1; i <= this.K; i++) {
                if (rand <= this.cdf[i]) {
                    degree = i;
                    break;
                }
            }
            const indicesSet = new Set();
            while (indicesSet.size < degree) {
                indicesSet.add(rng.nextInt(this.K));
            }
            blockIndices = Array.from(indicesSet);
        }
        const packetData = new Uint8Array(this.blockSize);
        for (const idx of blockIndices) {
            const src = this.sourceBlocks[idx];
            for (let b = 0; b < this.blockSize; b++) {
                packetData[b] ^= src[b];
            }
        }
        return {
            seed,
            degree,
            blockIndices,
            data: packetData
        };
    }
}
export class FountainDecoder {
    K;
    blockSize;
    originalSize;
    decodedBlocks;
    cdf;
    decodedCount = 0;
    receivedPacketsCount = 0;
    equations = [];
    constructor(K, blockSize, originalSize) {
        this.K = K;
        this.blockSize = blockSize;
        this.originalSize = originalSize;
        this.decodedBlocks = new Array(K).fill(null);
        this.cdf = generateRobustSolitonDistribution(K);
    }
    getDecodedBlocksCount() {
        return this.decodedCount;
    }
    getReceivedPacketsCount() {
        return this.receivedPacketsCount;
    }
    getProgress() {
        return (this.decodedCount / this.K) * 100;
    }
    isComplete() {
        return this.decodedCount === this.K;
    }
    addPacket(packet) {
        this.receivedPacketsCount++;
        if (this.isComplete())
            return true;
        // Reconstruct blockIndices from seed if not provided
        let blockIndices = packet.blockIndices;
        if (!blockIndices || blockIndices.length === 0) {
            if (packet.seed <= this.K) {
                blockIndices = [packet.seed - 1];
            }
            else {
                const rng = new SeededRandom(packet.seed);
                const rand = rng.nextFloat();
                let degree = 1;
                for (let i = 1; i <= this.K; i++) {
                    if (rand <= this.cdf[i]) {
                        degree = i;
                        break;
                    }
                }
                const indicesSet = new Set();
                while (indicesSet.size < degree) {
                    indicesSet.add(rng.nextInt(this.K));
                }
                blockIndices = Array.from(indicesSet);
            }
        }
        const indices = new Set();
        const data = new Uint8Array(packet.data);
        for (const idx of blockIndices) {
            if (this.decodedBlocks[idx] !== null) {
                const solved = this.decodedBlocks[idx];
                for (let b = 0; b < this.blockSize; b++) {
                    data[b] ^= solved[b];
                }
            }
            else {
                indices.add(idx);
            }
        }
        if (indices.size === 0)
            return this.isComplete();
        this.equations.push({ indices, data });
        this.solveBeliefPropagation();
        return this.isComplete();
    }
    solveBeliefPropagation() {
        let progress = true;
        while (progress && !this.isComplete()) {
            progress = false;
            for (let i = 0; i < this.equations.length; i++) {
                const eq = this.equations[i];
                if (eq.indices.size === 1) {
                    const solvedIdx = Array.from(eq.indices)[0];
                    if (this.decodedBlocks[solvedIdx] === null) {
                        this.decodedBlocks[solvedIdx] = new Uint8Array(eq.data);
                        this.decodedCount++;
                        progress = true;
                        const solvedData = eq.data;
                        for (let j = 0; j < this.equations.length; j++) {
                            if (j === i)
                                continue;
                            const targetEq = this.equations[j];
                            if (targetEq.indices.has(solvedIdx)) {
                                targetEq.indices.delete(solvedIdx);
                                for (let b = 0; b < this.blockSize; b++) {
                                    targetEq.data[b] ^= solvedData[b];
                                }
                            }
                        }
                    }
                    this.equations.splice(i, 1);
                    i--;
                }
            }
        }
    }
    assemblePayload() {
        if (!this.isComplete())
            return null;
        const result = new Uint8Array(this.originalSize);
        for (let i = 0; i < this.K; i++) {
            const block = this.decodedBlocks[i];
            const start = i * this.blockSize;
            const end = Math.min(this.originalSize, start + this.blockSize);
            result.set(block.subarray(0, end - start), start);
        }
        return result;
    }
}
//# sourceMappingURL=fountain.js.map