import { 
  CodecProfile, 
  TRANSMISSION_PROFILES, 
  computeSHA256, 
  crc32c, 
  serializeManifestHeader, 
  ManifestHeader 
} from '@optical/codec-core';
import { processFileCompression } from '@optical/compression';
import { encryptAESGCM } from '@optical/crypto';
import { FountainEncoder } from '@optical/erasure-recovery';
import { VisualFrameRenderer } from '@optical/visual-renderer';

let activeProfile: CodecProfile = TRANSMISSION_PROFILES.fast;
let currentPayload: Uint8Array | null = null;
let currentFileName = 'document.txt';
let currentMimeType = 'text/plain';

let encoder: FountainEncoder | null = null;
let manifest: ManifestHeader | null = null;
let manifestBytes: Uint8Array | null = null;
let renderer: VisualFrameRenderer | null = null;
let isBroadcasting = false;
let frameCount = 0;
let broadcastInterval: any = null;

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('sender-canvas') as HTMLCanvasElement;
  if (canvas) renderer = new VisualFrameRenderer(canvas);

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  dropzone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e: any) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });

  dropzone?.addEventListener('dragover', (e) => e.preventDefault());
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });

  document.getElementById('btn-sample-txt')?.addEventListener('click', () => {
    const sample = new TextEncoder().encode("Antigravity Windows Optical Sender Test Payload\n" + "Air-gap verified.\n".repeat(40));
    setPayload(sample, 'windows_test.txt', 'text/plain');
  });

  document.getElementById('btn-sample-binary')?.addEventListener('click', () => {
    const sample = new Uint8Array(500 * 1024);
    for (let i = 0; i < sample.length; i++) sample[i] = (i * 29) & 0xFF;
    setPayload(sample, 'data_payload.dat', 'application/octet-stream');
  });

  const encryptToggle = document.getElementById('encrypt-toggle') as HTMLInputElement;
  const passBox = document.getElementById('passphrase-box');
  encryptToggle?.addEventListener('change', () => {
    passBox!.style.display = encryptToggle.checked ? 'block' : 'none';
    if (currentPayload) setPayload(currentPayload, currentFileName, currentMimeType);
  });

  ['safe', 'fast', 'turbo'].forEach(mode => {
    document.getElementById(`profile-${mode}`)?.addEventListener('click', () => {
      ['safe', 'fast', 'turbo'].forEach(m => document.getElementById(`profile-${m}`)?.classList.remove('active-preset'));
      document.getElementById(`profile-${mode}`)?.classList.add('active-preset');
      activeProfile = TRANSMISSION_PROFILES[mode as keyof typeof TRANSMISSION_PROFILES];
      (document.getElementById('fps-slider') as HTMLInputElement).value = activeProfile.targetFPS.toString();
      document.getElementById('fps-label')!.innerText = `${activeProfile.targetFPS} FPS`;

      if (currentPayload) setPayload(currentPayload, currentFileName, currentMimeType);
    });
  });

  document.getElementById('fps-slider')?.addEventListener('input', (e: any) => {
    activeProfile.targetFPS = parseInt(e.target.value);
    document.getElementById('fps-label')!.innerText = `${activeProfile.targetFPS} FPS`;
    if (isBroadcasting) startBroadcast();
  });

  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    canvas?.requestFullscreen();
  });

  document.getElementById('btn-start')?.addEventListener('click', startBroadcast);
});

async function handleFile(file: File) {
  const buffer = await file.arrayBuffer();
  setPayload(new Uint8Array(buffer), file.name, file.type || 'application/octet-stream');
}

async function setPayload(bytes: Uint8Array, fileName: string, mimeType: string) {
  currentPayload = bytes;
  currentFileName = fileName;
  currentMimeType = mimeType;

  const comp = processFileCompression(bytes, fileName, mimeType);
  const sha256 = await computeSHA256(bytes);

  document.getElementById('meta-card')!.style.display = 'block';
  document.getElementById('meta-name')!.innerText = fileName;
  document.getElementById('meta-size')!.innerText = `${(bytes.length / 1024).toFixed(1)} KB`;
  document.getElementById('meta-comp')!.innerText = `${comp.compressionRatio.toFixed(2)}x`;

  const encrypted = (document.getElementById('encrypt-toggle') as HTMLInputElement)?.checked;
  let finalData = comp.data;
  let salt = new Uint8Array(16);
  let iv = new Uint8Array(12);

  if (encrypted) {
    const pass = (document.getElementById('sender-passphrase') as HTMLInputElement).value || 'Pass123';
    const encResult = await encryptAESGCM(comp.data, pass);
    finalData = encResult.ciphertext;
    salt = encResult.salt;
    iv = encResult.iv;
  }

  encoder = new FountainEncoder(finalData, activeProfile.blockSize);
  document.getElementById('meta-blocks')!.innerText = encoder.K.toString();

  const transferId = Math.floor(Math.random() * 65535);
  manifest = {
    transferId,
    originalSize: bytes.length,
    compressedSize: comp.compressedSize,
    compressed: comp.compressed,
    encrypted,
    salt,
    iv,
    totalSourceBlocks: encoder.K,
    blockSize: activeProfile.blockSize,
    sha256Hash: sha256,
    mimeType,
    fileName
  };

  manifestBytes = serializeManifestHeader(manifest);
  document.getElementById('meta-fp')!.innerText = `#${transferId.toString(16).toUpperCase()}`;
}

function startBroadcast() {
  if (!encoder || !manifest || !manifestBytes || !renderer) {
    alert('Please select a file to broadcast first.');
    return;
  }

  document.getElementById('idle-overlay')!.style.display = 'none';
  document.getElementById('send-status')!.innerText = 'BROADCASTING';
  isBroadcasting = true;
  frameCount = 0;

  if (broadcastInterval) clearInterval(broadcastInterval);

  const intervalMs = 1000 / activeProfile.targetFPS;
  broadcastInterval = setInterval(() => {
    if (!isBroadcasting) return;

    frameCount++;
    document.getElementById('send-frame')!.innerText = frameCount.toString();

    const isManifestFrame = frameCount % 10 === 1;
    let payloadBytes: Uint8Array;

    if (isManifestFrame) {
      payloadBytes = manifestBytes!;
    } else {
      const pkt = encoder!.generatePacket();
      const pktBuf = new Uint8Array(8 + pkt.data.length + 4);
      const view = new DataView(pktBuf.buffer);
      view.setUint32(0, pkt.seed, false);
      view.setUint16(4, pkt.degree, false);
      pktBuf.set(pkt.data, 8);
      const checksum = crc32c(pkt.data, pkt.seed);
      view.setUint32(8 + pkt.data.length, checksum, false);
      payloadBytes = pktBuf;
    }

    renderer!.renderFrame({
      frameId: frameCount,
      transferId: manifest!.transferId,
      isManifest: isManifestFrame,
      payloadBytes,
      profile: activeProfile
    });
  }, intervalMs);
}
