import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

class EncryptionService {
  private encryptionKey: Buffer;

  constructor() {
    // Generate or load encryption key
    this.encryptionKey = this.getOrCreateKey();
  }

  private getOrCreateKey(): Buffer {
    // For development - in production, you might want to derive this from a master password
    // or store it securely in the system keychain
    const keySource = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
    return crypto.scryptSync(keySource, 'salt', KEY_LENGTH);
  }

  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Combine IV + encrypted data
      const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex')]);
      return combined.toString('base64');
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  decrypt(encryptedData: string): string {
    try {
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, IV_LENGTH);
      const encrypted = combined.slice(IV_LENGTH);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      
      let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const encryptionService = new EncryptionService();