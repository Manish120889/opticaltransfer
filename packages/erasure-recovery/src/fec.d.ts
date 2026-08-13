export declare function computeSymbolParity(symbolBytes: Uint8Array): number;
export declare function encodeSymbolWithFEC(symbolBytes: Uint8Array): Uint8Array;
export declare function decodeSymbolWithFEC(encoded: Uint8Array): {
    valid: boolean;
    symbolBytes: Uint8Array;
};
