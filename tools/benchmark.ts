import { TRANSMISSION_PROFILES } from '../packages/codec-core/src/index.js';
import { FountainEncoder, FountainDecoder } from '../packages/erasure-recovery/src/index.js';

console.log("==================================================");
console.log(" ⚡ OPTICAL AIRGAP TRANSMISSION BENCHMARK HARNESS ");
console.log("==================================================");

const payloadSizes = [
  { label: '1 MB File', bytes: 1 * 1024 * 1024 },
  { label: '5 MB File', bytes: 5 * 1024 * 1024 },
  { label: '25 MB File', bytes: 25 * 1024 * 1024 }
];

for (const p of payloadSizes) {
  console.log(`\n📦 Benchmark Target: [${p.label}] (${(p.bytes / 1024 / 1024).toFixed(1)} MB)`);
  const data = new Uint8Array(p.bytes);
  for (let i = 0; i < data.length; i++) data[i] = (i * 19) & 0xFF;

  for (const mode of ['safe', 'fast', 'turbo'] as const) {
    const profile = TRANSMISSION_PROFILES[mode];
    const t0 = performance.now();

    const encoder = new FountainEncoder(data, profile.blockSize);
    const decoder = new FountainDecoder(encoder.K, encoder.blockSize, data.length);

    let packetsSent = 0;
    while (!decoder.isComplete()) {
      decoder.addPacket(encoder.generatePacket());
      packetsSent++;
    }

    const t1 = performance.now();
    const elapsedSec = (t1 - t0) / 1000;
    const throughputKB = (data.length / 1024) / elapsedSec;
    const overhead = ((packetsSent - encoder.K) / encoder.K) * 100;

    console.log(`  🔹 Profile [${mode.toUpperCase().padEnd(5)}]: ${throughputKB.toFixed(1)} KB/s | ${packetsSent} packets (K=${encoder.K}, overhead=${overhead.toFixed(1)}%) | time=${elapsedSec.toFixed(3)}s`);
  }
}

console.log("\n==================================================");
console.log(" ✅ Benchmark Complete!");
console.log("==================================================\n");
