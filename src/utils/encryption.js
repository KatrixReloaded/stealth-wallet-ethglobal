import CryptoJS from 'crypto-js';

export function encryptPrivateKey(privateKeyHex, password) {
    const cleanPrivateKey = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
    
    const salt = CryptoJS.lib.WordArray.random(16);
    const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 10000
    });
    
    const iv = CryptoJS.lib.WordArray.random(16);
    
    const encrypted = CryptoJS.AES.encrypt(cleanPrivateKey, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });

    return {
        salt: salt.toString(CryptoJS.enc.Hex),
        iv: iv.toString(CryptoJS.enc.Hex),
        ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Hex)
    };
}

export function decryptPrivateKey(data, password) {
    const salt = CryptoJS.enc.Hex.parse(data.salt);
    const iv = CryptoJS.enc.Hex.parse(data.iv);
    
    const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 10000
    });
    
    const ciphertext = CryptoJS.enc.Hex.parse(data.ciphertext);
    const encrypted = CryptoJS.lib.CipherParams.create({
        ciphertext: ciphertext
    });
    
    const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });

    return decrypted.toString(CryptoJS.enc.Utf8);
}