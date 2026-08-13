/**
 * Client-Side AES-256-GCM Encryption / Decryption Module with PBKDF2
 */
export async function encryptAESGCM(data, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength);
    const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuffer }, key, dataBuffer);
    return {
        ciphertext: new Uint8Array(ciphertextBuffer),
        salt,
        iv
    };
}
export async function decryptAESGCM(ciphertext, passphrase, salt, iv) {
    const key = await deriveKey(passphrase, salt);
    const cipherBuffer = ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength);
    const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength);
    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuffer }, key, cipherBuffer);
    return new Uint8Array(decryptedBuffer);
}
async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength);
    const passwordKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey({
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256'
    }, passwordKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
//# sourceMappingURL=crypto.js.map