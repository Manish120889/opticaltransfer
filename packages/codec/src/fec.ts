/**
 * Inner Symbol Forward Error Correction (FEC) & Parity Protection
 */

export interface ParityBlock {
  data: Uint8Array;
  parity: Uint8Array;
}

/**
 * Calculates longitudinal parity check bits over tile bytes
 */
export function computeSymbolParity(symbolBytes: Uint8Array): number {
  let parity = 0;
  for (let i = 0; i < symbolBytes.length; i++) {
    parity ^= symbolBytes[i];
  }
  return parity & 0xFF;
}

export function encodeSymbolWithFEC(symbolBytes: Uint8Array): Uint8Array {
  const parity = computeSymbolParity(symbolBytes);
  const result = new Uint8Array(symbolBytes.length + 1);
  result.set(symbolBytes, 0);
  result[symbolBytes.length] = parity;
  return result;
}

export function decodeSymbolWithFEC(encoded: Uint8Array): { valid: boolean; symbolBytes: Uint8Array } {
  if (encoded.length < 2) return { valid: false, symbolBytes: new Uint8Array(0) };
  
  const symbolBytes = encoded.subarray(0, encoded.length - 1);
  const expectedParity = encoded[encoded.length - 1];
  const actualParity = computeSymbolParity(symbolBytes);

  return {
    valid: actualParity === expectedParity,
    symbolBytes
  };
}
