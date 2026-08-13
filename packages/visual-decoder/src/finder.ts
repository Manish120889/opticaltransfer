import { Point2D } from './homography.js';

export interface FrameCorners {
  topLeft: Point2D;
  topRight: Point2D;
  bottomLeft: Point2D;
  bottomRight: Point2D;
}

/**
 * Searches for the 4 corner alignment finder patterns in a camera frame
 */
export function detectFrameCorners(imageData: ImageData): FrameCorners | null {
  const w = imageData.width;
  const h = imageData.height;
  
  // Fast boundary heuristic search for target finder patterns near 4 corners
  const marginX = w * 0.25;
  const marginY = h * 0.25;

  const topLeft = findCornerTarget(imageData, 0, 0, marginX, marginY, 'TL');
  const topRight = findCornerTarget(imageData, w - marginX, 0, w, marginY, 'TR');
  const bottomLeft = findCornerTarget(imageData, 0, h - marginY, marginX, h, 'BL');
  const bottomRight = findCornerTarget(imageData, w - marginX, h - marginY, w, h, 'BR');

  if (topLeft && topRight && bottomLeft && bottomRight) {
    return { topLeft, topRight, bottomLeft, bottomRight };
  }

  // Fallback: Default normalized view bounds if partial tracking
  return {
    topLeft: { x: w * 0.05, y: h * 0.05 },
    topRight: { x: w * 0.95, y: h * 0.05 },
    bottomLeft: { x: w * 0.05, y: h * 0.95 },
    bottomRight: { x: w * 0.95, y: h * 0.95 }
  };
}

function findCornerTarget(
  imageData: ImageData,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  corner: 'TL' | 'TR' | 'BL' | 'BR'
): Point2D | null {
  const w = imageData.width;
  const data = imageData.data;

  const startX = Math.max(0, Math.floor(minX));
  const endX = Math.min(w, Math.floor(maxX));
  const startY = Math.max(0, Math.floor(minY));
  const endY = Math.min(imageData.height, Math.floor(maxY));

  let minLuma = 255;
  let bestX = (startX + endX) / 2;
  let bestY = (startY + endY) / 2;

  const step = Math.max(2, Math.floor((endX - startX) / 16));

  for (let y = startY; y < endY; y += step) {
    for (let x = startX; x < endX; x += step) {
      const idx = (y * w + x) * 4;
      if (idx < data.length) {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        if (luma < minLuma) {
          minLuma = luma;
          bestX = x;
          bestY = y;
        }
      }
    }
  }

  return { x: bestX, y: bestY };
}
