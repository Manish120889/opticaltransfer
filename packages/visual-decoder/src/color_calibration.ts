/**
 * Dynamic Color Calibration Centroid Sampler
 */

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export class DynamicColorCalibrator {
  private centroids: ColorRGB[] = [];

  constructor(initialPaletteHex: string[]) {
    this.updatePaletteHex(initialPaletteHex);
  }

  public updatePaletteHex(paletteHex: string[]): void {
    this.centroids = paletteHex.map(hexToRGB);
  }

  public calibrateFromSwatches(swatchSamples: ColorRGB[]): void {
    if (swatchSamples.length === this.centroids.length) {
      for (let i = 0; i < swatchSamples.length; i++) {
        // Exponential moving average update (80% live frame swatch, 20% previous history)
        this.centroids[i] = {
          r: 0.8 * swatchSamples[i].r + 0.2 * this.centroids[i].r,
          g: 0.8 * swatchSamples[i].g + 0.2 * this.centroids[i].g,
          b: 0.8 * swatchSamples[i].b + 0.2 * this.centroids[i].b
        };
      }
    }
  }

  public findNearestColorIndex(rgb: [number, number, number]): number {
    const [r, g, b] = rgb;
    let minDistance = Infinity;
    let bestIndex = 0;

    for (let i = 0; i < this.centroids.length; i++) {
      const c = this.centroids[i];
      // Weighted perceptual Euclidean distance (human eye sensitivity: G > R > B)
      const dr = r - c.r;
      const dg = g - c.g;
      const db = b - c.b;
      const dist = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;

      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = i;
      }
    }

    return bestIndex;
  }
}

export function hexToRGB(hex: string): ColorRGB {
  if (hex.startsWith('rgb')) {
    const parts = hex.match(/\d+/g);
    if (parts && parts.length >= 3) {
      return { r: parseInt(parts[0]), g: parseInt(parts[1]), b: parseInt(parts[2]) };
    }
  }
  const cleanHex = hex.replace('#', '');
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}
