/**
 * Direct Linear Transform (DLT) 3x3 Homography Matrix Solver & Image Sampler
 */

export interface Point2D {
  x: number;
  y: number;
}

export type HomographyMatrix = number[]; // 3x3 matrix in 9-element array

export function computeHomography(srcPoints: Point2D[], dstPoints: Point2D[]): HomographyMatrix | null {
  if (srcPoints.length !== 4 || dstPoints.length !== 4) return null;

  // Build 8x8 linear equation matrix A x = b
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = srcPoints[i];
    const { x: u, y: v } = dstPoints[i];

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);

    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  // Gaussian elimination solver for 8x8 linear system
  const h = solveLinear8x8(A, b);
  if (!h) return null;

  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0];
}

export function transformPoint(h: HomographyMatrix, pt: Point2D): Point2D {
  const x = pt.x;
  const y = pt.y;
  const w = h[6] * x + h[7] * y + h[8];
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w
  };
}

export function sampleBilinear(imageData: ImageData, x: number, y: number): [number, number, number] {
  const w = imageData.width;
  const h = imageData.height;

  const ix = Math.floor(x);
  const iy = Math.floor(y);

  if (ix < 0 || ix >= w - 1 || iy < 0 || iy >= h - 1) {
    return [0, 0, 0];
  }

  const fx = x - ix;
  const fy = y - iy;

  const idxTL = (iy * w + ix) * 4;
  const idxTR = (iy * w + (ix + 1)) * 4;
  const idxBL = ((iy + 1) * w + ix) * 4;
  const idxBR = ((iy + 1) * w + (ix + 1)) * 4;

  const data = imageData.data;

  const r = (1 - fx) * (1 - fy) * data[idxTL] + fx * (1 - fy) * data[idxTR] + (1 - fx) * fy * data[idxBL] + fx * fy * data[idxBR];
  const g = (1 - fx) * (1 - fy) * data[idxTL + 1] + fx * (1 - fy) * data[idxTR + 1] + (1 - fx) * fy * data[idxBL + 1] + fx * fy * data[idxBR + 1];
  const b = (1 - fx) * (1 - fy) * data[idxTL + 2] + fx * (1 - fy) * data[idxTR + 2] + (1 - fx) * fy * data[idxBL + 2] + fx * fy * data[idxBR + 2];

  return [Math.round(r), Math.round(g), Math.round(b)];
}

function solveLinear8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    // Find pivot row
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    // Swap pivot row
    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    if (Math.abs(M[i][i]) < 1e-8) return null; // Singular matrix

    // Eliminate column
    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = sum / M[i][i];
  }

  return x;
}
