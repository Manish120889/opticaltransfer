import { 
  CodecProfile, 
  TRANSMISSION_PROFILES, 
  computeSHA256, 
  crc32c, 
  ManifestHeader 
} from '@optical/codec-core';
import { processFileCompression } from '@optical/compression';
import { encryptAESGCM, decryptAESGCM } from '@optical/crypto';
import { FountainEncoder, FountainDecoder } from '@optical/erasure-recovery';
import { VisualFrameRenderer } from '@optical/visual-renderer';
import { VisualFrameDecoder } from '@optical/visual-decoder';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

// Base64 Binary Utilities
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Application State
let activeProfile: CodecProfile = TRANSMISSION_PROFILES.fast;
let currentPayload: Uint8Array | null = null;
let currentFileName = 'document.txt';
let currentMimeType = 'text/plain';
let transmissionMode: 'qr' | 'grid' = 'qr';

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
let qrManifest: ManifestHeader | null = null;
let qrFountainDecoder: FountainDecoder | null = null;

let cameraStream: MediaStream | null = null;
let isCameraActive = false;
let receiverAnimFrame: number | null = null;
let recvStartTime = 0;
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

  // Mode selection (QR vs Grid)
  const modeQrBtn = document.getElementById('mode-qr');
  const modeGridBtn = document.getElementById('mode-grid');
  modeQrBtn?.addEventListener('click', () => {
    transmissionMode = 'qr';
    modeQrBtn.classList.add('active-preset');
    modeGridBtn?.classList.remove('active-preset');
    if (currentPayload) setFilePayload(currentPayload, currentFileName, currentMimeType);
  });
  modeGridBtn?.addEventListener('click', () => {
    transmissionMode = 'grid';
    modeGridBtn.classList.add('active-preset');
    modeQrBtn?.classList.remove('active-preset');
    if (currentPayload) setFilePayload(currentPayload, currentFileName, currentMimeType);
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
    const sample = new Uint8Array(200 * 1024);
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

  // Encryption Check
  const encrypted = (document.getElementById('encrypt-toggle') as HTMLInputElement)?.checked;
  let finalPayload = compResult.data;
  let salt = new Uint8Array(16);
  let iv = new Uint8Array(12);

  if (encrypted) {
    const pass = (document.getElementById('sender-passphrase') as HTMLInputElement)?.value || 'SecretPass123!';
    const encRes = await encryptAESGCM(compResult.data, pass);
    finalPayload = encRes.ciphertext;
    salt = encRes.salt;
    iv = encRes.iv;
  }

  // Set block size for QR mode (200 bytes for max QR scanning reliability) vs Grid mode
  const blockSize = transmissionMode === 'qr' ? 200 : activeProfile.blockSize;

  senderEncoder = new FountainEncoder(finalPayload, blockSize);

  const transferId = Math.floor(Math.random() * 0xFFFFFFFF);
  senderManifest = {
    transferId,
    originalSize: bytes.length,
    compressedSize: finalPayload.length,
    compressed: compResult.compressed,
    encrypted,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    totalSourceBlocks: senderEncoder.K,
    blockSize,
    sha256Hash: sha256,
    mimeType,
    fileName
  };

  document.getElementById('meta-blocks')!.innerText = `${senderEncoder.K} blocks (${blockSize}B/blk)`;
  document.getElementById('sender-fp')!.innerText = `#${transferId.toString(16).toUpperCase()}`;
}

function startBroadcast() {
  if (!senderEncoder || !senderManifest) {
    alert('Please select a payload file first.');
    return;
  }

  document.getElementById('sender-idle-overlay')?.classList.add('hidden');
  document.getElementById('send-status')!.innerText = 'BROADCASTING';
  isBroadcasting = true;
  senderFrameCount = 0;

  if (senderIntervalId) clearInterval(senderIntervalId);

  const canvas = document.getElementById('sender-canvas') as HTMLCanvasElement;
  const intervalMs = 1000 / activeProfile.targetFPS;

  senderIntervalId = setInterval(async () => {
    if (!isBroadcasting) return;

    senderFrameCount++;
    document.getElementById('sender-frame-count')!.innerText = senderFrameCount.toString();

    const isManifestFrame = senderFrameCount % 5 === 1;

    if (transmissionMode === 'qr') {
      // High-Reliability QR Code Frame Rendering
      let qrPayload = '';
      if (isManifestFrame) {
        qrPayload = JSON.stringify({
          m: 1,
          fn: senderManifest!.fileName,
          sz: senderManifest!.originalSize,
          cz: senderManifest!.compressedSize,
          k: senderManifest!.totalSourceBlocks,
          bs: senderManifest!.blockSize,
          h: senderManifest!.sha256Hash,
          t: senderManifest!.transferId
        });
      } else {
        const pkt = senderEncoder!.generatePacket();
        qrPayload = JSON.stringify({
          m: 0,
          s: pkt.seed,
          d: pkt.degree,
          p: bytesToBase64(pkt.data)
        });
      }

      try {
        await QRCode.toCanvas(canvas, qrPayload, {
          width: 440,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'L'
        });
      } catch (err) {
        console.error('QR rendering error:', err);
      }
    } else {
      // Legacy Matrix Grid Rendering
      let payloadBytes: Uint8Array;
      if (isManifestFrame) {
        payloadBytes = new TextEncoder().encode(JSON.stringify(senderManifest));
      } else {
        const pkt = senderEncoder!.generatePacket();
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
    }

  }, intervalMs);
}

// RECEIVER UI
function initReceiverUI() {
  document.getElementById('btn-start-camera')?.addEventListener('click', startCameraReceiver);
  document.getElementById('btn-download-file')?.addEventListener('click', () => {
    if (reconstructedBlobUrl) {
      const a = document.createElement('a');
      a.href = reconstructedBlobUrl;
      a.download = receiverDecoder.manifest?.fileName || qrManifest?.fileName || 'reconstructed_file';
      a.click();
    }
  });
}

async function startCameraReceiver() {
  try {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
    }
    const video = document.getElementById('receiver-video') as HTMLVideoElement;
    video.srcObject = cameraStream;
    video.setAttribute('playsinline', 'true');
    video.play();
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
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);

      if (imgData) {
        let frameProcessed = false;

        // 1. Try High-Reliability QR Decoder (jsQR)
        const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) {
          try {
            const data = JSON.parse(code.data);
            recvValidFrames++;
            frameProcessed = true;

            if (data.m === 1) {
              // Manifest Frame
              if (!qrManifest || qrManifest.transferId !== data.t) {
                qrManifest = {
                  transferId: data.t,
                  originalSize: data.sz,
                  compressedSize: data.cz,
                  compressed: false,
                  encrypted: false,
                  salt: '',
                  iv: '',
                  totalSourceBlocks: data.k,
                  blockSize: data.bs,
                  sha256Hash: data.h,
                  mimeType: 'application/octet-stream',
                  fileName: data.fn
                };
                qrFountainDecoder = new FountainDecoder(data.k, data.bs, data.cz);
                receiverDecoder.manifest = qrManifest as any;
              }
            } else if (data.m === 0 && qrFountainDecoder) {
              // Data Frame
              const pktData = base64ToBytes(data.p);
              qrFountainDecoder.addPacket({
                seed: data.s,
                degree: data.d,
                blockIndices: [],
                data: pktData
              });
            }

            // Draw cyan tracking box around scanned QR code
            if (ctx && code.location) {
              ctx.strokeStyle = '#06B6D4';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.moveTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
              ctx.lineTo(code.location.topRightCorner.x, code.location.topRightCorner.y);
              ctx.lineTo(code.location.bottomRightCorner.x, code.location.bottomRightCorner.y);
              ctx.lineTo(code.location.bottomLeftCorner.x, code.location.bottomLeftCorner.y);
              ctx.closePath();
              ctx.stroke();
            }
          } catch (e) {
            recvInvalidFrames++;
          }
        }

        // 2. Fallback to Matrix Grid Decoder if not QR
        if (!frameProcessed) {
          const result = receiverDecoder.decodeImageData(imgData);
          if (result.success) {
            recvValidFrames++;
            if (result.corners && ctx) {
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
        }

        updateReceiverTelemetry();
      }
    }

    receiverAnimFrame = requestAnimationFrame(loop);
  }

  loop();
}

function updateReceiverTelemetry() {
  const fountain = qrFountainDecoder || receiverDecoder.fountainDecoder;
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
  const fountain = qrFountainDecoder || receiverDecoder.fountainDecoder;
  const manifest = qrManifest || receiverDecoder.manifest;
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

  // Auto trigger download for frictionless UX
  const autoDownloadLink = document.createElement('a');
  autoDownloadLink.href = reconstructedBlobUrl;
  autoDownloadLink.download = manifest.fileName;
  autoDownloadLink.click();
}

// SIMULATOR UI
function initSimulatorUI() {
  document.getElementById('btn-run-simulation')?.addEventListener('click', runOpticalSimulation);
}

function runOpticalSimulation() {
  const logsEl = document.getElementById('sim-logs')!;
  logsEl.innerHTML = '<p class="text-cyan-400">[Simulator] Starting 500KB payload QR Fountain Simulation...</p>';

  const simPayload = new Uint8Array(50000);
  for (let i = 0; i < simPayload.length; i++) simPayload[i] = (i * 37) & 0xFF;

  const encoder = new FountainEncoder(simPayload, 200);
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

    if (frame % 10 === 0) {
      logsEl.innerHTML += `<p class="text-slate-300">Frame ${frame}: Decoder Progress ${decoder.getProgress().toFixed(1)}% | Solved ${decoder.getDecodedBlocksCount()}/${encoder.K} | Dropped ${dropped} frames (${((dropped/frame)*100).toFixed(0)}% loss)</p>`;
    }

    if (decoder.isComplete()) {
      clearInterval(simInterval);
      const assembled = decoder.assemblePayload()!;
      logsEl.innerHTML += `<p class="text-emerald-400 font-bold">[Simulator Success] Reconstructed ${assembled.length} bytes cleanly with 35% simulated loss! ✅</p>`;
    }
  }, 30);
}

// BENCHMARK UI
function initBenchmarkUI() {
  document.getElementById('btn-run-benchmark')?.addEventListener('click', runBenchmarkSuite);
}

async function runBenchmarkSuite() {
  const resultsEl = document.getElementById('bench-results')!;
  resultsEl.innerHTML = '<p class="text-cyan-400">[Benchmark] Running end-to-end UAT verification suite...</p>';

  const sizes = [10, 50, 200]; // KB
  for (const sizeKB of sizes) {
    const payload = new Uint8Array(sizeKB * 1024);
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 17) & 0xFF;

    const t0 = performance.now();
    const encoder = new FountainEncoder(payload, 200);
    const decoder = new FountainDecoder(encoder.K, encoder.blockSize, payload.length);

    let packetsSent = 0;
    while (!decoder.isComplete() && packetsSent < encoder.K * 3) {
      packetsSent++;
      const pkt = encoder.generatePacket();
      decoder.addPacket(pkt);
    }

    const t1 = performance.now();
    const hashOrig = await computeSHA256(payload);
    const hashDec = await computeSHA256(decoder.assemblePayload()!);

    const pass = hashOrig === hashDec;
    resultsEl.innerHTML += `<p class="${pass ? 'text-emerald-400' : 'text-rose-400'}">[Test ${sizeKB}KB Payload] Fountain Solved in ${(t1-t0).toFixed(1)}ms | Packets: ${packetsSent} | Hash Verification: ${pass ? 'PASSED ✅' : 'FAILED ❌'}</p>`;
  }
}
