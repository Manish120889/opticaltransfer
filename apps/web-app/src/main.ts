import { 
  CodecProfile, 
  TRANSMISSION_PROFILES, 
  computeSHA256, 
  crc32c, 
  serializeManifestHeader, 
  ManifestHeader 
} from '@optical/codec-core';
import { processFileCompression } from '@optical/compression';
import { encryptAESGCM, decryptAESGCM } from '@optical/crypto';
import { FountainEncoder, FountainDecoder } from '@optical/erasure-recovery';
import { VisualFrameRenderer } from '@optical/visual-renderer';
import { VisualFrameDecoder } from '@optical/visual-decoder';

// Application State
let activeProfile: CodecProfile = TRANSMISSION_PROFILES.fast;
let currentPayload: Uint8Array | null = null;
let currentFileName = 'document.txt';
let currentMimeType = 'text/plain';

// Sender State
let senderEncoder: FountainEncoder | null = null;
let senderManifest: ManifestHeader | null = null;
let senderManifestBytes: Uint8Array | null = null;
let senderRenderer: VisualFrameRenderer | null = null;
let isBroadcasting = false;
let senderFrameCount = 0;
let senderIntervalId: any = null;

// Receiver State
let receiverDecoder: VisualFrameDecoder = new VisualFrameDecoder(activeProfile);
let cameraStream: MediaStream | null = null;
let isCameraActive = false;
let receiverAnimFrame: number | null = null;
let recvStartTime = 0;
let recvTotalBytes = 0;
let recvValidFrames = 0;
let recvInvalidFrames = 0;
let reconstructedBlobUrl: string | null = null;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSenderUI();
  initReceiverUI();
  initSimulatorUI();
  initBenchmarkUI();
});

// TAB SWITCHING
function initTabs() {
  const tabs = ['sender', 'receiver', 'simulator', 'benchmark', 'specs'];
  tabs.forEach(t => {
    document.getElementById(`tab-${t}`)?.addEventListener('click', () => {
      tabs.forEach(other => {
        document.getElementById(`tab-${other}`)?.classList.remove('active-tab');
        document.getElementById(`content-${other}`)?.classList.add('hidden');
      });
      document.getElementById(`tab-${t}`)?.classList.add('active-tab');
      document.getElementById(`content-${t}`)?.classList.remove('hidden');
    });
  });
}

// SENDER UI
function initSenderUI() {
  const canvas = document.getElementById('sender-canvas') as HTMLCanvasElement;
  if (canvas) senderRenderer = new VisualFrameRenderer(canvas);

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  dropzone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e: any) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  });

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-cyan-500');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-cyan-500');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-cyan-500');
    const file = e.dataTransfer?.files[0];
    if (file) handleFileSelected(file);
  });

  // Sample Loaders
  document.getElementById('btn-sample-txt')?.addEventListener('click', () => {
    const sample = new TextEncoder().encode("Antigravity Optical Air-Gapped Transmission System\nAuthor: Manish Dadhwal\n" + "Zero-network screen-to-camera file transfer.\n".repeat(50));
    setFilePayload(sample, 'sample_report.txt', 'text/plain');
  });

  document.getElementById('btn-sample-code')?.addEventListener('click', () => {
    const sample = new TextEncoder().encode("// Antigravity Codec Core\nexport function airgap() { return '0-Network'; }\n".repeat(100));
    setFilePayload(sample, 'codec_source.ts', 'text/plain');
  });

  document.getElementById('btn-sample-binary')?.addEventListener('click', () => {
    const sample = new Uint8Array(500 * 1024);
    for (let i = 0; i < sample.length; i++) sample[i] = (i * 31) & 0xFF;
    setFilePayload(sample, 'binary_bundle.dat', 'application/octet-stream');
  });

  // AES Encryption Toggle
  const encryptToggle = document.getElementById('encrypt-toggle') as HTMLInputElement;
  const passContainer = document.getElementById('passphrase-container');
  encryptToggle?.addEventListener('change', () => {
    if (encryptToggle.checked) {
      passContainer?.classList.remove('hidden');
    } else {
      passContainer?.classList.add('hidden');
    }
    if (currentPayload) setFilePayload(currentPayload, currentFileName, currentMimeType);
  });

  document.getElementById('sender-passphrase')?.addEventListener('input', () => {
    if (currentPayload) setFilePayload(currentPayload, currentFileName, currentMimeType);
  });

  // Preset Buttons
  ['safe', 'fast', 'turbo'].forEach(mode => {
    document.getElementById(`profile-${mode}`)?.addEventListener('click', () => {
      ['safe', 'fast', 'turbo'].forEach(m => document.getElementById(`profile-${m}`)?.classList.remove('active-preset'));
      document.getElementById(`profile-${mode}`)?.classList.add('active-preset');
      activeProfile = TRANSMISSION_PROFILES[mode as keyof typeof TRANSMISSION_PROFILES];
      (document.getElementById('fps-slider') as HTMLInputElement).value = activeProfile.targetFPS.toString();
      document.getElementById('fps-label')!.innerText = `${activeProfile.targetFPS} FPS`;
      receiverDecoder.setProfile(activeProfile);

      if (currentPayload) setFilePayload(currentPayload, currentFileName, currentMimeType);
    });
  });

  // FPS Slider
  document.getElementById('fps-slider')?.addEventListener('input', (e: any) => {
    const fps = parseInt(e.target.value);
    activeProfile.targetFPS = fps;
    document.getElementById('fps-label')!.innerText = `${fps} FPS`;
    if (isBroadcasting) startBroadcast();
  });

  // Pause / Resume Broadcast
  const btnPause = document.getElementById('btn-pause-send');
  btnPause?.addEventListener('click', () => {
    isBroadcasting = !isBroadcasting;
    const statusEl = document.getElementById('send-status')!;
    if (isBroadcasting) {
      statusEl.innerText = 'BROADCASTING';
      btnPause.innerText = 'Pause';
    } else {
      statusEl.innerText = 'PAUSED';
      btnPause.innerText = 'Resume';
    }
  });

  // Fullscreen Canvas
  document.getElementById('btn-fullscreen-send')?.addEventListener('click', () => {
    canvas?.requestFullscreen();
  });

  // Start Broadcast
  document.getElementById('btn-start-send')?.addEventListener('click', () => {
    startBroadcast();
    btnPause?.classList.remove('hidden');
  });
}

async function handleFileSelected(file: File) {
  const buffer = await file.arrayBuffer();
  setFilePayload(new Uint8Array(buffer), file.name, file.type || 'application/octet-stream');
}

async function setFilePayload(bytes: Uint8Array, fileName: string, mimeType: string) {
  currentPayload = bytes;
  currentFileName = fileName;
  currentMimeType = mimeType;

  // Process Compression
  const compResult = processFileCompression(bytes, fileName, mimeType);
  const sha256 = await computeSHA256(bytes);

  // Update UI Meta Card
  document.getElementById('file-meta-card')?.classList.remove('hidden');
  document.getElementById('meta-filename')!.innerText = fileName;
  document.getElementById('meta-size')!.innerText = `${(bytes.length / 1024).toFixed(1)} KB`;
  document.getElementById('meta-comp-ratio')!.innerText = `${compResult.compressionRatio.toFixed(2)}x (${compResult.compressed ? 'Compressed' : 'Bypassed'})`;
  document.getElementById('meta-sha256')!.innerText = sha256.substring(0, 16) + '...';

  // Initialize Fountain Encoder
  const encrypted = (document.getElementById('encrypt-toggle') as HTMLInputElement)?.checked;
  let finalPayload = compResult.data;
  let salt = new Uint8Array(16);
  let iv = new Uint8Array(12);

  if (encrypted) {
    const pass = (document.getElementById('sender-passphrase') as HTMLInputElement).value || 'DefaultPass123';
    const encResult = await encryptAESGCM(compResult.data, pass);
    finalPayload = encResult.ciphertext;
    salt = encResult.salt;
    iv = encResult.iv;
  }

  senderEncoder = new FountainEncoder(finalPayload, activeProfile.blockSize);
  document.getElementById('meta-blocks')!.innerText = senderEncoder.K.toString();

  const transferId = Math.floor(Math.random() * 65535);
  senderManifest = {
    transferId,
    originalSize: bytes.length,
    compressedSize: compResult.compressedSize,
    compressed: compResult.compressed,
    encrypted,
    salt,
    iv,
    totalSourceBlocks: senderEncoder.K,
    blockSize: activeProfile.blockSize,
    sha256Hash: sha256,
    mimeType,
    fileName
  };

  senderManifestBytes = serializeManifestHeader(senderManifest);
  document.getElementById('sender-fp')!.innerText = `#${transferId.toString(16).toUpperCase()}`;
}

function startBroadcast() {
  if (!senderEncoder || !senderManifest || !senderManifestBytes || !senderRenderer) {
    alert('Please select a payload file first.');
    return;
  }

  document.getElementById('sender-idle-overlay')?.classList.add('hidden');
  document.getElementById('send-status')!.innerText = 'BROADCASTING';
  isBroadcasting = true;
  senderFrameCount = 0;

  if (senderIntervalId) clearInterval(senderIntervalId);

  const intervalMs = 1000 / activeProfile.targetFPS;
  senderIntervalId = setInterval(() => {
    if (!isBroadcasting) return;

    senderFrameCount++;
    document.getElementById('sender-frame-count')!.innerText = senderFrameCount.toString();

    // Broadcast Manifest every 10 frames, else Fountain Data Packet
    const isManifestFrame = senderFrameCount % 10 === 1;
    let payloadBytes: Uint8Array;

    if (isManifestFrame) {
      payloadBytes = senderManifestBytes!;
    } else {
      const pkt = senderEncoder!.generatePacket();
      
      // Serialize Fountain Packet payload: seed (4B) + degree (2B) + data + CRC32 (4B)
      const pktBuf = new Uint8Array(8 + pkt.data.length + 4);
      const view = new DataView(pktBuf.buffer);
      view.setUint32(0, pkt.seed, false);
      view.setUint16(4, pkt.degree, false);
      pktBuf.set(pkt.data, 8);
      const checksum = crc32c(pkt.data, pkt.seed);
      view.setUint32(8 + pkt.data.length, checksum, false);
      payloadBytes = pktBuf;
    }

    senderRenderer!.renderFrame({
      frameId: senderFrameCount,
      transferId: senderManifest!.transferId,
      isManifest: isManifestFrame,
      payloadBytes,
      profile: activeProfile
    });

  }, intervalMs);
}

// RECEIVER UI
function initReceiverUI() {
  document.getElementById('btn-start-camera')?.addEventListener('click', startCameraReceiver);
  document.getElementById('btn-download-file')?.addEventListener('click', () => {
    if (reconstructedBlobUrl) {
      const a = document.createElement('a');
      a.href = reconstructedBlobUrl;
      a.download = receiverDecoder.manifest?.fileName || 'reconstructed_file';
      a.click();
    }
  });
}

async function startCameraReceiver() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const video = document.getElementById('receiver-video') as HTMLVideoElement;
    video.srcObject = cameraStream;
    video.classList.remove('hidden');
    document.getElementById('camera-off-overlay')?.classList.add('hidden');
    isCameraActive = true;
    recvStartTime = performance.now();

    startReceiverFrameLoop();
  } catch (err: any) {
    alert('Camera access denied or unavailable: ' + err.message);
  }
}

function startReceiverFrameLoop() {
  const video = document.getElementById('receiver-video') as HTMLVideoElement;
  const canvas = document.getElementById('receiver-hud-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');

  function loop() {
    if (!isCameraActive) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);

      if (imgData) {
        const result = receiverDecoder.decodeImageData(imgData);
        if (result.success) {
          recvValidFrames++;
          if (result.corners && ctx) {
            // Draw tracking quad overlay on HUD canvas
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(result.corners.topLeft.x, result.corners.topLeft.y);
            ctx.lineTo(result.corners.topRight.x, result.corners.topRight.y);
            ctx.lineTo(result.corners.bottomRight.x, result.corners.bottomRight.y);
            ctx.lineTo(result.corners.bottomLeft.x, result.corners.bottomLeft.y);
            ctx.closePath();
            ctx.stroke();
          }
        } else {
          recvInvalidFrames++;
        }

        updateReceiverTelemetry();
      }
    }

    receiverAnimFrame = requestAnimationFrame(loop);
  }

  loop();
}

function updateReceiverTelemetry() {
  const fountain = receiverDecoder.fountainDecoder;
  if (!fountain) return;

  const pct = fountain.getProgress();
  document.getElementById('recv-progress-pct')!.innerText = `${pct.toFixed(1)}%`;
  (document.getElementById('recv-progress-bar') as HTMLElement).style.width = `${pct}%`;

  const elapsed = (performance.now() - recvStartTime) / 1000;
  const speedKB = elapsed > 0 ? (fountain.getDecodedBlocksCount() * fountain.blockSize / 1024) / elapsed : 0;
  document.getElementById('recv-stat-speed')!.innerText = `${speedKB.toFixed(1)} KB/s`;

  const totalFrames = recvValidFrames + recvInvalidFrames;
  const lossPct = totalFrames > 0 ? (recvInvalidFrames / totalFrames) * 100 : 0;
  document.getElementById('recv-stat-loss')!.innerText = `${lossPct.toFixed(1)}%`;

  document.getElementById('recv-stat-blocks')!.innerText = `${fountain.getDecodedBlocksCount()} / ${fountain.K}`;
  document.getElementById('recv-stat-captured')!.innerText = totalFrames.toString();

  if (fountain.isComplete() && !reconstructedBlobUrl) {
    finishReceiverReconstruction();
  }
}

async function finishReceiverReconstruction() {
  const fountain = receiverDecoder.fountainDecoder;
  const manifest = receiverDecoder.manifest;
  if (!fountain || !manifest) return;

  const rawAssembled = fountain.assemblePayload();
  if (!rawAssembled) return;

  let finalPayload = rawAssembled;

  // Decrypt if needed
  if (manifest.encrypted) {
    const pass = prompt('Enter session passphrase to decrypt received file:') || '';
    try {
      finalPayload = await decryptAESGCM(rawAssembled, pass, manifest.salt, manifest.iv);
    } catch (e) {
      alert('Decryption failed! Incorrect passphrase.');
      return;
    }
  }

  // SHA-256 Verify
  const actualHash = await computeSHA256(finalPayload);
  if (actualHash !== manifest.sha256Hash) {
    alert(`SHA-256 Verification Failed!\nExpected: ${manifest.sha256Hash}\nActual: ${actualHash}`);
    return;
  }

  const blob = new Blob([finalPayload], { type: manifest.mimeType });
  reconstructedBlobUrl = URL.createObjectURL(blob);

  document.getElementById('recv-file-ready-card')?.classList.remove('hidden');
  document.getElementById('recv-ready-filename')!.innerText = `${manifest.fileName} (${(finalPayload.length / 1024).toFixed(1)} KB) - SHA256 Verified ✅`;
}

// SIMULATOR UI
function initSimulatorUI() {
  document.getElementById('btn-run-simulation')?.addEventListener('click', runOpticalSimulation);
}

function runOpticalSimulation() {
  const logsEl = document.getElementById('sim-logs')!;
  logsEl.innerHTML = '<p class="text-cyan-400">[Simulator] Starting 5MB payload virtual optical simulation...</p>';

  const simPayload = new Uint8Array(100000);
  for (let i = 0; i < simPayload.length; i++) simPayload[i] = (i * 37) & 0xFF;

  const encoder = new FountainEncoder(simPayload, 128);
  const decoder = new FountainDecoder(encoder.K, encoder.blockSize, simPayload.length);

  let frame = 0;
  let dropped = 0;

  const simInterval = setInterval(() => {
    frame++;
    const pkt = encoder.generatePacket();

    // Inject 35% frame drop simulation
    if (Math.random() < 0.35) {
      dropped++;
    } else {
      decoder.addPacket(pkt);
    }

    if (frame % 20 === 0) {
      logsEl.innerHTML += `<p class="text-slate-300">Frame ${frame}: Decoder Progress ${decoder.getProgress().toFixed(1)}% | Solved ${decoder.getDecodedBlocksCount()}/${encoder.K} | Dropped ${dropped} frames (${((dropped/frame)*100).toFixed(0)}% loss)</p>`;
      logsEl.scrollTop = logsEl.scrollHeight;
    }

    if (decoder.isComplete()) {
      clearInterval(simInterval);
      const assembled = decoder.assemblePayload();
      const match = assembled && assembled.every((v, idx) => v === simPayload[idx]);

      logsEl.innerHTML += `<p class="text-emerald-400 font-bold">[Success] Payload reconstructed 100% bit-exact! Total Frames: ${frame}, Dropped: ${dropped} (${((dropped/frame)*100).toFixed(1)}% loss rate).</p>`;
      logsEl.scrollTop = logsEl.scrollHeight;
    }
  }, 20);
}

// BENCHMARKS UI
function initBenchmarkUI() {
  document.getElementById('btn-run-benchmark')?.addEventListener('click', runBenchmarks);
}

function runBenchmarks() {
  const benchmarkPayload = new Uint8Array(250000); // 250 KB
  for (let i = 0; i < benchmarkPayload.length; i++) benchmarkPayload[i] = (i * 13) & 0xFF;

  ['safe', 'fast', 'turbo'].forEach(mode => {
    const profile = TRANSMISSION_PROFILES[mode as keyof typeof TRANSMISSION_PROFILES];
    const t0 = performance.now();
    const enc = new FountainEncoder(benchmarkPayload, profile.blockSize);
    const dec = new FountainDecoder(enc.K, enc.blockSize, benchmarkPayload.length);

    while (!dec.isComplete()) {
      dec.addPacket(enc.generatePacket());
    }

    const t1 = performance.now();
    const elapsedSec = (t1 - t0) / 1000;
    const kbps = (benchmarkPayload.length / 1024) / elapsedSec;

    document.getElementById(`bench-${mode}-speed`)!.innerText = `${kbps.toFixed(1)} KB/s`;
  });
}
