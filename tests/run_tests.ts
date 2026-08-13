import { 
  crc32c, 
  computeSHA256, 
  syncSHA256Hex, 
  serializeManifestHeader, 
  deserializeManifestHeader,
  TRANSMISSION_PROFILES,
  packBitsToColorIndices,
  unpackColorIndicesToBits
} from '../packages/codec-core/src/index.ts';
import { 
  compressData, 
  decompressData, 
  processFileCompression 
} from '../packages/compression/src/index.ts';
import { 
  encryptAESGCM, 
  decryptAESGCM 
} from '../packages/crypto/src/index.ts';
import { 
  FountainEncoder, 
  FountainDecoder 
} from '../packages/erasure-recovery/src/index.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runTest(name: string, fn: () => Promise<void> | void) {
  console.log(`\n▶ Running Test: [${name}]`);
  try {
    await fn();
  } catch (err: any) {
    console.error(`  ❌ ERROR in ${name}:`, err.message || err);
    failed++;
  }
}

async function main() {
  console.log("==================================================");
  console.log(" 🧪 OPTICAL FILE TRANSFER CODEC TEST HARNESS ");
  console.log("==================================================");

  // 1. CRC32C
  await runTest("CRC32C Checksum", () => {
    const data = new TextEncoder().encode("123456789");
    const val = crc32c(data);
    assert(typeof val === 'number' && val > 0, `CRC32C calculated: 0x${val.toString(16)}`);
    const val2 = crc32c(data);
    assert(val === val2, "CRC32C determinism verified");
  });

  // 2. SHA-256
  await runTest("SHA-256 Digest", async () => {
    const data = new TextEncoder().encode("Antigravity Optical Airgap Test");
    const hashHex1 = syncSHA256Hex(data);
    const hashHex2 = await computeSHA256(data);
    assert(hashHex1 === hashHex2, `SHA-256 match: ${hashHex1}`);
  });

  // 3. AES-256-GCM Encryption / Decryption
  await runTest("AES-256-GCM Encryption Roundtrip", async () => {
    const payload = new TextEncoder().encode("Confidential air-gapped document contents 2026");
    const passphrase = "TopSecretPassword123!";
    
    const enc = await encryptAESGCM(payload, passphrase);
    assert(enc.ciphertext.length > 0, `Ciphertext generated (${enc.ciphertext.length} bytes)`);
    
    const dec = await decryptAESGCM(enc.ciphertext, passphrase, enc.salt, enc.iv);
    const decryptedText = new TextDecoder().decode(dec);
    assert(decryptedText === "Confidential air-gapped document contents 2026", "AES-256-GCM decryption matched original text");
  });

  // 4. Lossless Compression
  await runTest("Compression Engine & Bypass Rules", () => {
    const sampleText = new TextEncoder().encode("AAAAABBBBBCCCCCDDDDD".repeat(50));
    const comp = processFileCompression(sampleText, "document.txt", "text/plain");
    assert(comp.compressed === true, `Text file compressed: ratio ${comp.compressionRatio.toFixed(2)}x`);

    const decomp = decompressData(comp.data);
    const decompText = new TextDecoder().decode(decomp);
    assert(decompText === new TextDecoder().decode(sampleText), "Decompressed text matches original");

    const zipBypass = processFileCompression(new Uint8Array([1, 2, 3]), "archive.zip", "application/zip");
    assert(zipBypass.compressed === false, "ZIP file automatically bypassed compression");
  });

  // 5. Manifest Header Serialization
  await runTest("Manifest Header Serialization", () => {
    const manifest = {
      transferId: 0xA1F4,
      originalSize: 1048576,
      compressedSize: 524288,
      compressed: true,
      encrypted: true,
      salt: new Uint8Array(16).fill(7),
      iv: new Uint8Array(12).fill(3),
      totalSourceBlocks: 4096,
      blockSize: 128,
      sha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      mimeType: "application/pdf",
      fileName: "financial_report_2026.pdf"
    };

    const buffer = serializeManifestHeader(manifest);
    assert(buffer.length > 80, `Manifest buffer size: ${buffer.length} bytes`);

    const deserialized = deserializeManifestHeader(buffer);
    assert(deserialized !== null, "Manifest deserialized successfully");
    assert(deserialized?.fileName === manifest.fileName, `Filename parsed: ${deserialized?.fileName}`);
    assert(deserialized?.transferId === manifest.transferId, `Transfer ID parsed: 0x${deserialized?.transferId.toString(16)}`);
  });

  // 6. Fountain Coding & Erasure Recovery
  await runTest("Fountain Code Dropless Erasure Recovery (0% Frame Loss)", () => {
    const payload = new Uint8Array(5000);
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 17) & 0xFF;

    const encoder = new FountainEncoder(payload, 128);
    const decoder = new FountainDecoder(encoder.K, encoder.blockSize, payload.length);

    let packetsSent = 0;
    while (!decoder.isComplete() && packetsSent < encoder.K * 3) {
      const pkt = encoder.generatePacket();
      decoder.addPacket(pkt);
      packetsSent++;
    }

    assert(decoder.isComplete(), `Decoded payload in ${packetsSent} packets (K = ${encoder.K})`);
    const assembled = decoder.assemblePayload();
    assert(assembled !== null && assembled.every((v, i) => v === payload[i]), "Assembled payload bit-exact match verified");
  });

  await runTest("Fountain Code Dropless Erasure Recovery (30% Simulated Frame Drops)", () => {
    const payload = new Uint8Array(10000);
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 31) & 0xFF;

    const encoder = new FountainEncoder(payload, 128);
    const decoder = new FountainDecoder(encoder.K, encoder.blockSize, payload.length);

    let packetsTotal = 0;
    let packetsCaptured = 0;

    while (!decoder.isComplete() && packetsTotal < encoder.K * 5) {
      const pkt = encoder.generatePacket();
      packetsTotal++;

      // Simulate 30% optical frame drops (blur, closed eyes, lost tracking)
      if (packetsTotal % 10 < 7) {
        decoder.addPacket(pkt);
        packetsCaptured++;
      }
    }

    assert(decoder.isComplete(), `Decoded with 30% loss (${packetsCaptured} captured out of ${packetsTotal} sent)`);
    const assembled = decoder.assemblePayload();
    assert(assembled !== null && assembled.every((v, i) => v === payload[i]), "Reconstructed file matches perfectly under high frame loss");
  });

  // 7. Tile Packing / Unpacking Math
  await runTest("Tile Bit Packing & Unpacking Math", () => {
    const bits = new Uint8Array([0b10110011, 0b11001100]);
    const indices = packBitsToColorIndices(bits, 4, 4); // 4 bits/tile -> 4 tiles
    assert(indices.length === 4, `Packed 2 bytes into 4 4-bit tile indices: [${indices.join(', ')}]`);
    
    const unpacked = unpackColorIndicesToBits(indices, 4, 2);
    assert(unpacked[0] === bits[0] && unpacked[1] === bits[1], "Unpacked tile indices match original bytes");
  });

  console.log("\n==================================================");
  console.log(` 📊 SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("==================================================\n");

  if (failed > 0) process.exit(1);
}

main();
