import { FountainEncoder, FountainDecoder } from '@optical/erasure-recovery';
import { computeSHA256 } from '@optical/codec-core';
import crypto from 'crypto';

async function runUAT() {
  console.log("==================================================");
  console.log("🧪 STARTING FULL AUTOMATED UAT VERIFICATION SUITE ");
  console.log("==================================================");

  // 1. Test 100KB Random Binary Payload
  const payloadSize = 100 * 1024;
  const originalPayload = crypto.randomBytes(payloadSize);
  const expectedHash = crypto.createHash('sha256').update(originalPayload).digest('hex');

  console.log(`[UAT Step 1] Original Payload Size: ${(payloadSize/1024).toFixed(1)} KB`);
  console.log(`[UAT Step 1] Original SHA-256: ${expectedHash}`);

  // 2. Initialize Fountain Encoder (200B blocks)
  const encoder = new FountainEncoder(new Uint8Array(originalPayload), 200);
  const decoder = new FountainDecoder(encoder.K, encoder.blockSize, payloadSize);

  console.log(`[UAT Step 2] Total Source Blocks (K): ${encoder.K}`);

  // 3. Simulate QR Code transmission over noisy air-gap channel (30% frame drop loss)
  let framesSent = 0;
  let framesDropped = 0;
  let framesReceived = 0;

  while (!decoder.isComplete() && framesSent < encoder.K * 4) {
    framesSent++;
    const pkt = encoder.generatePacket();

    // Base64 serialize (simulating QR payload)
    const b64Data = Buffer.from(pkt.data).toString('base64');
    const qrPayloadStr = JSON.stringify({
      m: 0,
      s: pkt.seed,
      d: pkt.degree,
      p: b64Data
    });

    // Simulate noise/glare frame drop (30% loss)
    if (Math.random() < 0.30) {
      framesDropped++;
      continue;
    }

    // Decode QR string payload on Receiver side
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

  // 4. Verify Reconstruction Completeness
  if (!decoder.isComplete()) {
    console.error("❌ [UAT FAIL] Decoder failed to complete reconstruction within threshold!");
    process.exit(1);
  }

  const reconstructed = decoder.assemblePayload();
  if (!reconstructed) {
    console.error("❌ [UAT FAIL] Assembled payload is null!");
    process.exit(1);
  }

  const actualHash = crypto.createHash('sha256').update(reconstructed).digest('hex');

  console.log(`[UAT Step 3] Total Frames Broadcast: ${framesSent}`);
  console.log(`[UAT Step 3] Simulated Frame Loss: ${framesDropped} (${((framesDropped/framesSent)*100).toFixed(1)}%)`);
  console.log(`[UAT Step 3] Successful Frames Captured: ${framesReceived}`);
  console.log(`[UAT Step 4] Reconstructed SHA-256: ${actualHash}`);

  if (actualHash === expectedHash) {
    console.log("==================================================");
    console.log("✅ UAT SUCCESS: 100% BIT-FOR-BIT RECONSTRUCTION VERIFIED!");
    console.log("==================================================");
  } else {
    console.error("❌ [UAT FAIL] Cryptographic hash mismatch!");
    process.exit(1);
  }
}

runUAT().catch(err => {
  console.error("❌ [UAT ERROR]", err);
  process.exit(1);
});
