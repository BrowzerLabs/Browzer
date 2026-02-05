import { safeStorage, app } from 'electron';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
} from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import log from 'electron-log';

export class CryptoService {
  private static instance: CryptoService;
  private masterKey: Buffer | null = null;
  private isInitialized = false;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32;
  private readonly IV_LENGTH = 12;
  private readonly AUTH_TAG_LENGTH = 16;
  private readonly SALT_LENGTH = 32;
  private readonly PBKDF2_ITERATIONS = 100000;

  public static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  public async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      if (!safeStorage.isEncryptionAvailable()) {
        log.error('[CryptoService] OS-level encryption not available');
        return false;
      }

      this.masterKey = await this.getOrCreateMasterKey();
      this.isInitialized = true;
      log.info('[CryptoService] Initialized successfully');
      return true;
    } catch (error) {
      log.error('[CryptoService] Initialization failed:', error);
      return false;
    }
  }

  private async getOrCreateMasterKey(): Promise<Buffer> {
    const keyPath = join(app.getPath('userData'), '.master-key');

    try {
      if (existsSync(keyPath)) {
        const encryptedKey = readFileSync(keyPath);
        const decryptedKey = safeStorage.decryptString(encryptedKey);
        return Buffer.from(decryptedKey, 'base64');
      }

      const newKey = randomBytes(this.KEY_LENGTH);
      const encryptedKey = safeStorage.encryptString(newKey.toString('base64'));
      writeFileSync(keyPath, encryptedKey, { mode: 0o600 });

      log.info('[CryptoService] Created new master key');
      return newKey;
    } catch (error) {
      log.error('[CryptoService] Failed to get/create master key:', error);
      throw error;
    }
  }

  public encrypt(plaintext: string): string {
    if (!this.isInitialized || !this.masterKey) {
      throw new Error('CryptoService not initialized');
    }

    try {
      const salt = randomBytes(this.SALT_LENGTH);
      const derivedKey = pbkdf2Sync(
        this.masterKey,
        salt,
        this.PBKDF2_ITERATIONS,
        this.KEY_LENGTH,
        'sha256'
      );

      const iv = randomBytes(this.IV_LENGTH);
      const cipher = createCipheriv(this.ALGORITHM, derivedKey, iv);

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      const result = Buffer.concat([
        Buffer.from([1]),
        salt,
        iv,
        authTag,
        encrypted,
      ]);

      return result.toString('base64');
    } catch (error) {
      log.error('[CryptoService] Encryption failed:', error);
      throw error;
    }
  }

  public decrypt(ciphertext: string): string {
    if (!this.isInitialized || !this.masterKey) {
      throw new Error('CryptoService not initialized');
    }

    try {
      const data = Buffer.from(ciphertext, 'base64');

      const version = data[0];
      if (version !== 1) {
        throw new Error(`Unsupported encryption version: ${version}`);
      }

      let offset = 1;
      const salt = data.subarray(offset, offset + this.SALT_LENGTH);
      offset += this.SALT_LENGTH;

      const iv = data.subarray(offset, offset + this.IV_LENGTH);
      offset += this.IV_LENGTH;

      const authTag = data.subarray(offset, offset + this.AUTH_TAG_LENGTH);
      offset += this.AUTH_TAG_LENGTH;

      const encrypted = data.subarray(offset);

      const derivedKey = pbkdf2Sync(
        this.masterKey,
        salt,
        this.PBKDF2_ITERATIONS,
        this.KEY_LENGTH,
        'sha256'
      );

      const decipher = createDecipheriv(this.ALGORITHM, derivedKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      log.error('[CryptoService] Decryption failed:', error);
      throw error;
    }
  }

  public isReady(): boolean {
    return this.isInitialized && this.masterKey !== null;
  }

  public async rotateMasterKey(): Promise<boolean> {
    try {
      const keyPath = join(app.getPath('userData'), '.master-key');
      const newKey = randomBytes(this.KEY_LENGTH);
      const encryptedKey = safeStorage.encryptString(newKey.toString('base64'));

      writeFileSync(keyPath + '.new', encryptedKey, { mode: 0o600 });

      const oldMasterKey = this.masterKey;
      this.masterKey = newKey;

      return true;
    } catch (error) {
      log.error('[CryptoService] Master key rotation failed:', error);
      return false;
    }
  }
}
