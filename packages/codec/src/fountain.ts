/**
 * Robust Soliton Luby Transform (LT) Fountain Code Engine
 * Rateless rateless erasure coding for dropless optical recovery.
 */

export interface FountainPacket {
  seed: number;
  degree: number;
  blockIndices: number[];
  data: Uint8Array;
}

/**
 * Linear Congruential PRNG derived from packet seed for deterministic index sampling
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextFloat(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  nextInt(max: number): number {
    return Math.floor(this.nextFloat() * max);
  }
}

/**
 * Robust Soliton Degree Distribution generator
 */
export function generateRobustSolitonDistribution(K: number, c = 0.1, delta = 0.05): number[] {
  const probs = new Float64Array(K + 1);
  
  // Ideal Soliton
  probs[1] = 1.0 / K;
  for (let i = 2; i <= K; i++) {
    probs[i] = 1.0 / (i * (i - 1));
  }

  // Robust addition
  const S = c * Math.log(K / delta) * Math.sqrt(K);
  const R_limit = Math.floor(K / S);

  for (let i = 1; i <= K; i++) {
    if (i < R_limit) {
      probs[i] += S / (K * i);
    } else if (i === R_limit) {
      probs[i] += (S * Math.log(S / delta)) / K;
    }
  }

  // Normalize CDF
  let sum = 0;
  for (let i = 1; i <= K; i++) sum += probs[i];

  const cdf: number[] = new Array(K + 1);
  let acc = 0;
  for (let i = 1; i <= K; i++) {
    acc += probs[i] / sum;
    cdf[i] = acc;
  }
  cdf[K] = 1.0;

  return cdf;
}

export class FountainEncoder {
  public readonly K: number;
  public readonly blockSize: number;
  private readonly sourceBlocks: Uint8Array[];
  private readonly cdf: number[];
  private currentSeed = 1;

  constructor(payload: Uint8Array, blockSize: number = 128) {
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

  public generatePacket(specifiedSeed?: number): FountainPacket {
    const seed = specifiedSeed !== undefined ? specifiedSeed : (this.currentSeed++ >>> 0);
    const rng = new SeededRandom(seed);
    
    // Sample degree from CDF
    const rand = rng.nextFloat();
    let degree = 1;
    for (let i = 1; i <= this.K; i++) {
      if (rand <= this.cdf[i]) {
        degree = i;
        break;
      }
    }

    // Sample distinct indices
    const indicesSet = new Set<number>();
    while (indicesSet.size < degree) {
      indicesSet.add(rng.nextInt(this.K));
    }
    const blockIndices = Array.from(indicesSet);

    // XOR source blocks together
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
  public readonly K: number;
  public readonly blockSize: number;
  public readonly originalSize: number;
  private readonly decodedBlocks: (Uint8Array | null)[];
  private decodedCount = 0;
  private receivedPacketsCount = 0;
  
  // Active linear equation graph
  private equations: { indices: Set<number>; data: Uint8Array }[] = [];

  constructor(K: number, blockSize: number, originalSize: number) {
    this.K = K;
    this.blockSize = blockSize;
    this.originalSize = originalSize;
    this.decodedBlocks = new Array(K).fill(null);
  }

  public getDecodedBlocksCount(): number {
    return this.decodedCount;
  }

  public getReceivedPacketsCount(): number {
    return this.receivedPacketsCount;
  }

  public getProgress(): number {
    return (this.decodedCount / this.K) * 100;
  }

  public isComplete(): boolean {
    return this.decodedCount === this.K;
  }

  public addPacket(packet: FountainPacket): boolean {
    this.receivedPacketsCount++;

    if (this.isComplete()) return true;

    const indices = new Set<number>();
    const data = new Uint8Array(packet.data);

    // XOR out already decoded blocks from the packet
    for (const idx of packet.blockIndices) {
      if (this.decodedBlocks[idx] !== null) {
        const solved = this.decodedBlocks[idx]!;
        for (let b = 0; b < this.blockSize; b++) {
          data[b] ^= solved[b];
        }
      } else {
        indices.add(idx);
      }
    }

    if (indices.size === 0) return this.isComplete(); // Redundant packet

    // Add equation and trigger belief propagation
    this.equations.push({ indices, data });
    this.solveBeliefPropagation();

    return this.isComplete();
  }

  private solveBeliefPropagation(): void {
    let progress = true;

    while (progress && !this.isComplete()) {
      progress = false;

      // Find any degree-1 equation
      for (let i = 0; i < this.equations.length; i++) {
        const eq = this.equations[i];
        if (eq.indices.size === 1) {
          const solvedIdx = Array.from(eq.indices)[0];
          
          if (this.decodedBlocks[solvedIdx] === null) {
            this.decodedBlocks[solvedIdx] = new Uint8Array(eq.data);
            this.decodedCount++;
            progress = true;

            // Substitute solved block into all remaining equations
            const solvedData = eq.data;
            for (let j = 0; j < this.equations.length; j++) {
              if (j === i) continue;
              const targetEq = this.equations[j];
              if (targetEq.indices.has(solvedIdx)) {
                targetEq.indices.delete(solvedIdx);
                for (let b = 0; b < this.blockSize; b++) {
                  targetEq.data[b] ^= solvedData[b];
                }
              }
            }
          }
          
          // Remove processed equation
          this.equations.splice(i, 1);
          i--;
        }
      }
    }
  }

  public assemblePayload(): Uint8Array | null {
    if (!this.isComplete()) return null;

    const result = new Uint8Array(this.originalSize);
    for (let i = 0; i < this.K; i++) {
      const block = this.decodedBlocks[i]!;
      const start = i * this.blockSize;
      const end = Math.min(this.originalSize, start + this.blockSize);
      result.set(block.subarray(0, end - start), start);
    }
    return result;
  }
}
