import { FountainEncoder, FountainDecoder } from '@optical/erasure-recovery';
import { computeSHA256 } from '@optical/codec-core';
import crypto from 'crypto';

async function runHighSpeedUAT() {
  console.log("==================================================");
  console.log("⚡ HIGH-SPEED UAT BENCHMARK: 22KB PAYLOAD TRANSFER ");
  console.log("==================================================");

  // 1. Create 22KB test payload
  const payloadSize = 22 * 1024; // 22KB
  const originalPayload = crypto.randomBytes(payloadSize);
  const expectedHash = crypto.createHash('sha256').update(originalPayload).digest('hex');

  console.log(`[UAT Benchmark] Payload Size: ${(payloadSize/1024).toFixed(1)} KB (22,528 Bytes)`);
  console.log(`[UAT Benchmark] Original SHA-256: ${expectedHash}`);

  // 2. Initialize Fountain Encoder with High-Capacity 650B Blocks
  const encoder = new FountainEncoder(new Uint8Array(originalPayload), 650);
  const decoder = new FountainDecoder(encoder.K, encoder.blockSize, payloadSize);

  console.log(`[UAT Benchmark] Total Source Blocks (K): ${encoder.K} blocks`);

  // 3. Simulate High-Speed Broadcast with 20% Simulated Camera Frame Drops
  const t0 = performance.now();
  let framesSent = 0;
  let framesDropped = 0;
  let framesReceived = 0;

  while (!decoder.isComplete() && framesSent < encoder.K * 4) {
    framesSent++;
    const pkt = encoder.generatePacket();

    // Base64 serialize
    const b64Data = Buffer.from(pkt.data).toString('base64');
    const qrPayloadStr = JSON.stringify({
      m: 0,
      s: pkt.seed,
      d: pkt.degree,
      p: b64Data
    });

    // 20% frame drop simulation
    if (Math.random() < 0.20) {
      framesDropped++;
      continue;
    }

    // Decode QR string payload
    const parsedQR = JSON.parse(qrPayloadStr);
    const pktBytes = new Uint8Array(Buffer.from(parsedQR.p, 'base64'));

    decoder.addPacket({
      seed: parsedQR.s,
      degree: parsedQR.d,
      blockIndices: [],
      data: pktBytes
    });
    framesReceived++;
  }

  const t1 = performance.now();
  const elapsedMs = t1 - t0;
  const simulatedSecondsAt45FPS = framesSent / 45;

  if (!decoder.isComplete()) {
    console.error("❌ [UAT FAIL] Fountain Decoder did not complete!");
    process.exit(1);
  }

  const reconstructed = decoder.assemblePayload();
  const actualHash = crypto.createHash('sha256').update(reconstructed).digest('hex');

  console.log(`[UAT Benchmark] Total Frames Broadcast: ${framesSent}`);
  console.log(`[UAT Benchmark] Simulated Frame Loss: ${framesDropped} (${((framesDropped/framesSent)*100).toFixed(1)}%)`);
  console.log(`[UAT Benchmark] Successful Frames Captured: ${framesReceived}`);
  console.log(`[UAT Benchmark] In-Memory Processing Time: ${elapsedMs.toFixed(2)} ms`);
  console.log(`[UAT Benchmark] Estimated 45 FPS Air-Gap Transfer Duration: ${simulatedSecondsAt45FPS.toFixed(2)} seconds`);

  if (actualHash === expectedHash) {
    console.log("==================================================");
    console.log(`⚡ SUCCESS: 22KB FILE RECONSTRUCTED IN ${simulatedSecondsAt45FPS.toFixed(2)} SECONDS AT 45 FPS!`);
    console.log("==================================================");
  } else {
    console.error("❌ [UAT FAIL] Cryptographic hash mismatch!");
    process.exit(1);
  }
}

runHighSpeedUAT().catch(err => {
  console.error("❌ [UAT ERROR]", err);
  process.exit(1);
});
