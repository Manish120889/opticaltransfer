/**
 * Client-Side AES-256-GCM Encryption / Decryption Module with PBKDF2
 */
export interface EncryptedPayload {
    ciphertext: Uint8Array;
    salt: Uint8Array;
    iv: Uint8Array;
}
export declare function encryptAESGCM(data: Uint8Array, passphrase: string): Promise<EncryptedPayload>;
export declare function decryptAESGCM(ciphertext: Uint8Array, passphrase: string, salt: Uint8Array, iv: Uint8Array): Promise<Uint8Array>;
