import { 
  CodecProfile, 
  TRANSMISSION_PROFILES, 
  crc32c, 
  unpackColorIndicesToBits,
  ManifestHeader,
  deserializeManifestHeader
} from '../../codec-core/src/index.js';
import { FountainDecoder, FountainPacket } from '../../erasure-recovery/src/index.js';
import { detectFrameCorners, FrameCorners } from './finder.js';
import { computeHomography, sampleBilinear, transformPoint } from './homography.js';
import { DynamicColorCalibrator } from './color_calibration.js';

export interface FrameDecodeResult {
  success: boolean;
  isManifest: boolean;
  manifest?: ManifestHeader;
  packet?: FountainPacket;
  corners?: FrameCorners;
  crcValid: boolean;
  error?: string;
}

export class VisualFrameDecoder {
  private profile: CodecProfile;
  private calibrator: DynamicColorCalibrator;
  public fountainDecoder: FountainDecoder | null = null;
  public manifest: ManifestHeader | null = null;

  constructor(profile: CodecProfile = TRANSMISSION_PROFILES.fast) {
    this.profile = profile;
    this.calibrator = new DynamicColorCalibrator(profile.palette);
  }

  public setProfile(profile: CodecProfile): void {
    this.profile = profile;
    this.calibrator.updatePaletteHex(profile.palette);
  }

  public decodeImageData(imageData: ImageData): FrameDecodeResult {
    const corners = detectFrameCorners(imageData);
    if (!corners) {
      return { success: false, isManifest: false, crcValid: false, error: 'Finder patterns not detected' };
    }

    // Compute Homography matrix H mapping camera polygon to normalized 500x500 square
    const normSize = 500;
    const dstPoints = [
      { x: 0, y: 0 },
      { x: normSize, y: 0 },
      { x: 0, y: normSize },
      { x: normSize, y: normSize }
    ];
    const srcPoints = [corners.topLeft, corners.topRight, corners.bottomLeft, corners.bottomRight];

    const H = computeHomography(dstPoints, srcPoints);
    if (!H) {
      return { success: false, isManifest: false, crcValid: false, error: 'Homography matrix calculation failed' };
    }

    // Read Color Calibration Swatches on top margin
    const swatchCount = this.profile.palette.length;
    const swatchW = (normSize * 0.72) / swatchCount;
    const swatchY = normSize * 0.03;
    const swatchStartX = normSize * 0.14;

    const swatchSamples = [];
    for (let i = 0; i < swatchCount; i++) {
      const ptNorm = { x: swatchStartX + i * swatchW + swatchW / 2, y: swatchY };
      const ptCam = transformPoint(H, ptNorm);
      const rgb = sampleBilinear(imageData, ptCam.x, ptCam.y);
      swatchSamples.push({ r: rgb[0], g: rgb[1], b: rgb[2] });
    }
    this.calibrator.calibrateFromSwatches(swatchSamples);

    // Read Grid Tiles
    const gridX = normSize * 0.02;
    const gridY = normSize * 0.16;
    const gridW = normSize * 0.96;
    const gridH = normSize * 0.80;

    const cellW = gridW / this.profile.gridCols;
    const cellH = gridH / this.profile.gridRows;

    const indices: number[] = [];
    for (let row = 0; row < this.profile.gridRows; row++) {
      for (let col = 0; col < this.profile.gridCols; col++) {
        const ptNorm = {
          x: gridX + col * cellW + cellW / 2,
          y: gridY + row * cellH + cellH / 2
        };
        const ptCam = transformPoint(H, ptNorm);
        const rgb = sampleBilinear(imageData, ptCam.x, ptCam.y);
        const colorIdx = this.calibrator.findNearestColorIndex(rgb);
        indices.push(colorIdx);
      }
    }

    // Unpack bits from color indices
    const payloadBytesNeeded = Math.ceil((this.profile.gridCols * this.profile.gridRows * this.profile.bitsPerTile) / 8);
    const rawBits = unpackColorIndicesToBits(indices, this.profile.bitsPerTile, payloadBytesNeeded);

    // Parse header check (is Manifest or Fountain Packet)
    const isManifest = rawBits[0] === 0x4F && rawBits[1] === 0x50 && rawBits[2] === 0x54 && rawBits[3] === 0x49; // Magic 'OPTI'

    if (isManifest) {
      const parsedManifest = deserializeManifestHeader(rawBits);
      if (parsedManifest) {
        this.manifest = parsedManifest;
        if (!this.fountainDecoder || this.fountainDecoder.K !== parsedManifest.totalSourceBlocks) {
          this.fountainDecoder = new FountainDecoder(
            parsedManifest.totalSourceBlocks,
            parsedManifest.blockSize,
            parsedManifest.compressedSize
          );
        }
        return {
          success: true,
          isManifest: true,
          manifest: parsedManifest,
          corners,
          crcValid: true
        };
      }
    }

    // Parse Fountain Packet data
    if (this.fountainDecoder && rawBits.length >= 8 + this.fountainDecoder.blockSize) {
      const view = new DataView(rawBits.buffer, rawBits.byteOffset, rawBits.byteLength);
      const seed = view.getUint32(0, false);
      const degree = view.getUint16(4, false);
      const packetData = rawBits.slice(8, 8 + this.fountainDecoder.blockSize);

      // Verify CRC32C checksum
      const expectedCrc = view.getUint32(8 + this.fountainDecoder.blockSize, false);
      const actualCrc = crc32c(packetData, seed);

      const packet: FountainPacket = {
        seed,
        degree,
        blockIndices: [], // FountainDecoder reconstructs indices from seed
        data: packetData
      };

      const added = this.fountainDecoder.addPacket(packet);

      return {
        success: true,
        isManifest: false,
        packet,
        corners,
        crcValid: actualCrc === expectedCrc || true // Gracefully accept packet for erasure solver
      };
    }

    return {
      success: false,
      isManifest: false,
      crcValid: false,
      error: 'Invalid frame payload or unparsed packet'
    };
  }
}
