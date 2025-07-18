import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

class EncryptionService {
  private encryptionKey: Buffer;
  private keyFilePath: string;

  constructor() {
    this.keyFilePath = path.join(process.cwd(), 'data', '.encryption.key');
    this.encryptionKey = this.getOrCreateEncryptionKey();
  }

  private getOrCreateEncryptionKey(): Buffer {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.keyFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Try to read existing key
      if (fs.existsSync(this.keyFilePath)) {
        const keyData = fs.readFileSync(this.keyFilePath);
        if (keyData.length === KEY_LENGTH) {
          logger.info('Loaded existing encryption key');
          return keyData;
        }
      }

      // Generate new key
      const newKey = crypto.randomBytes(KEY_LENGTH);
      fs.writeFileSync(this.keyFilePath, newKey, { mode: 0o600 }); // Read/write for owner only
      logger.info('Generated new encryption key');
      return newKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize encryption key', { error: errorMessage });
      throw new Error('Failed to initialize encryption system');
    }
  }

  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipher(ALGORITHM, this.encryptionKey);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Combine IV + encrypted data
      const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex')]);
      return combined.toString('base64');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Encryption failed', { error: errorMessage });
      throw new Error('Failed to encrypt data');
    }
  }

  decrypt(encryptedData: string): string {
    try {
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract components
      const iv = combined.slice(0, IV_LENGTH);
      const encrypted = combined.slice(IV_LENGTH);
      
      const decipher = crypto.createDecipher(ALGORITHM, this.encryptionKey);
      
      let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Decryption failed', { error: errorMessage });
      throw new Error('Failed to decrypt data');
    }
  }

  // Utility method to check if data appears to be encrypted
  isEncrypted(data: string): boolean {
    try {
      // Check if it's valid base64 and has expected length structure
      const buffer = Buffer.from(data, 'base64');
      return buffer.length > IV_LENGTH;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService(); 