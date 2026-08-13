import { CodecProfile, TRANSMISSION_PROFILES, crc32c, packBitsToColorIndices } from '../../codec-core/src/index.js';

export interface FrameRenderData {
  frameId: number;
  transferId: number;
  isManifest: boolean;
  payloadBytes: Uint8Array;
  profile: CodecProfile;
}

export class VisualFrameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Failed to get 2D canvas context');
    this.ctx = context;
  }

  public renderFrame(data: FrameRenderData): void {
    const { profile, frameId, transferId, isManifest, payloadBytes } = data;
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, width, height);

    const finderSize = Math.min(width, height) * 0.14;
    
    // 1. Draw 4 Corner Finder Alignment Patterns
    this.drawFinderPattern(0, 0, finderSize); // Top-Left
    this.drawFinderPattern(width - finderSize, 0, finderSize); // Top-Right
    this.drawFinderPattern(0, height - finderSize, finderSize); // Bottom-Left
    this.drawFinderPattern(width - finderSize, height - finderSize, finderSize); // Bottom-Right

    // 2. Draw Color Swatches Calibration Bar (Top & Bottom margins)
    const swatchWidth = (width - finderSize * 2) / profile.palette.length;
    const swatchHeight = finderSize * 0.4;

    for (let i = 0; i < profile.palette.length; i++) {
      this.ctx.fillStyle = profile.palette[i];
      // Top bar
      this.ctx.fillRect(finderSize + i * swatchWidth, 0, swatchWidth, swatchHeight);
      // Bottom bar
      this.ctx.fillRect(finderSize + i * swatchWidth, height - swatchHeight, swatchWidth, swatchHeight);
    }

    // 3. Draw Header Metadata Strip
    const headerY = swatchHeight;
    const headerHeight = finderSize * 0.4;
    this.ctx.fillStyle = '#111827';
    this.ctx.fillRect(finderSize, headerY, width - finderSize * 2, headerHeight);

    // Compute CRC32C over payload bytes
    const checksum = crc32c(payloadBytes);
    this.ctx.fillStyle = '#10B981';
    this.ctx.font = `bold ${Math.floor(headerHeight * 0.55)}px monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    const headerText = `F:${frameId} T:${transferId.toString(16).toUpperCase()} ${isManifest ? 'MANIFEST' : 'DATA'} CRC:${checksum.toString(16).toUpperCase()}`;
    this.ctx.fillText(headerText, width / 2, headerY + headerHeight / 2);

    // 4. Draw Dense Color Grid Matrix
    const gridX = finderSize * 0.2;
    const gridY = headerY + headerHeight + 5;
    const gridW = width - gridX * 2;
    const gridH = height - finderSize - gridY - 5;

    const cellW = gridW / profile.gridCols;
    const cellH = gridH / profile.gridRows;

    const totalTiles = profile.gridCols * profile.gridRows;
    const bitsPerTile = profile.bitsPerTile;

    const indices = packBitsToColorIndices(payloadBytes, bitsPerTile, totalTiles);

    for (let row = 0; row < profile.gridRows; row++) {
      for (let col = 0; col < profile.gridCols; col++) {
        const tileIndex = row * profile.gridCols + col;
        const paletteIdx = indices[tileIndex];
        this.ctx.fillStyle = profile.palette[paletteIdx % profile.palette.length];
        this.ctx.fillRect(gridX + col * cellW, gridY + row * cellH, cellW - 0.5, cellH - 0.5);
      }
    }
  }

  private drawFinderPattern(x: number, y: number, size: number): void {
    // Outer Black Box
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(x, y, size, size);

    // Outer White Border
    this.ctx.strokeStyle = '#FFFFFF';
    this.ctx.lineWidth = Math.max(2, size * 0.08);
    this.ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);

    // Inner White Ring
    const ringOffset = size * 0.2;
    const ringSize = size * 0.6;
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(x + ringOffset, y + ringOffset, ringSize, ringSize);

    // Inner Black Center Core
    const coreOffset = size * 0.35;
    const coreSize = size * 0.3;
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(x + coreOffset, y + coreOffset, coreSize, coreSize);
  }
}
