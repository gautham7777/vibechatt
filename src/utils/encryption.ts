import CryptoJS from 'crypto-js';

// Define a placeholder key for simplicity, or grab from URL hash.
// For true E2EE, this should be dynamically generated and passed via URL fragment
// e.g. https://vibechat.com/#ROOM_ID:SECRET_KEY
// To avoid making massive breaking changes to the auth flow, we will use a session-scoped
// secret key derived from the room code, OR ideally a random one.

export const generateRoomKey = () => {
  return CryptoJS.lib.WordArray.random(256 / 8).toString();
};

let currentRoomKey: string | null = null;

export const setRoomKey = (key: string) => {
  currentRoomKey = key;
};

export const getRoomKey = () => {
  return currentRoomKey;
};

export const encryptText = (text: string, key?: string): string => {
  const secret = key || currentRoomKey;
  if (!secret) return text; // Fallback to plaintext if no key
  try {
    const ciphertext = CryptoJS.AES.encrypt(text, secret).toString();
    return `E2EE:${ciphertext}`;
  } catch (e) {
    return text;
  }
};

export const decryptText = (ciphertext: string, key?: string): string => {
  const secret = key || currentRoomKey;
  if (!ciphertext.startsWith('E2EE:')) return ciphertext; // Not encrypted or old message
  if (!secret) return '🔒 [Encrypted Message]'; 
  
  try {
    const actualCipher = ciphertext.replace('E2EE:', '');
    const bytes = CryptoJS.AES.decrypt(actualCipher, secret);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText || '🔒 [Decryption Failed]';
  } catch (e) {
    return '🔒 [Decryption Failed]';
  }
};

export const encryptFile = (dataUrl: string, key?: string): string => {
  const secret = key || currentRoomKey;
  if (!secret) return dataUrl;
  const ciphertext = CryptoJS.AES.encrypt(dataUrl, secret).toString();
  return `E2EE_FILE:${ciphertext}`;
};

export const decryptFile = (ciphertext: string, key?: string): string => {
  const secret = key || currentRoomKey;
  if (!ciphertext.startsWith('E2EE_FILE:')) return ciphertext;
  if (!secret) return ''; 

  try {
    const actualCipher = ciphertext.replace('E2EE_FILE:', '');
    const bytes = CryptoJS.AES.decrypt(actualCipher, secret);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return '';
  }
};
