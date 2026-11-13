import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredSecrets = {
  bookstackTokenId?: string;
  bookstackTokenSecret?: string;
  anythingllmApiKey?: string;
};

export type CredentialSource = "env" | "encrypted" | "none";

type VaultOptions = {
  masterKey: string | undefined;
  secretsFilePath: string;
  env: NodeJS.ProcessEnv;
};

function deriveKey(masterKey: string): Buffer {
  return createHash("sha256").update(masterKey, "utf8").digest();
}

export class SecretsVault {
  constructor(private readonly options: VaultOptions) {}

  async readEncrypted(): Promise<StoredSecrets> {
    if (!this.options.masterKey) {
      return {};
    }
    try {
      const raw = await readFile(this.options.secretsFilePath);
      return decryptJson(raw, this.options.masterKey);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return {};
      }
      throw err;
    }
  }

  async writeEncrypted(secrets: StoredSecrets): Promise<void> {
    if (!this.options.masterKey) {
      throw new Error(
        "SECRETS_MASTER_KEY requis pour stocker des secrets chiffrés (clé hors SQLite)",
      );
    }
    await mkdir(path.dirname(this.options.secretsFilePath), { recursive: true });
    const payload = encryptJson(secrets, this.options.masterKey);
    await writeFile(this.options.secretsFilePath, payload, { mode: 0o600 });
  }

  /** Résolution effective : env prioritaire sur fichier chiffré. */
  async resolve(): Promise<{
    secrets: StoredSecrets;
    sources: {
      bookstackToken: CredentialSource;
      anythingllmApiKey: CredentialSource;
    };
  }> {
    const encrypted = await this.readEncrypted();
    const envId = this.options.env.BOOKSTACK_TOKEN_ID?.trim();
    const envSecret = this.options.env.BOOKSTACK_TOKEN_SECRET?.trim();
    const envKey = this.options.env.ANYTHINGLLM_API_KEY?.trim();

    const bookstackFromEnv = Boolean(envId && envSecret);
    const anythingFromEnv = Boolean(envKey);

    const secrets: StoredSecrets = {};
    if (bookstackFromEnv && envId && envSecret) {
      secrets.bookstackTokenId = envId;
      secrets.bookstackTokenSecret = envSecret;
    } else if (encrypted.bookstackTokenId && encrypted.bookstackTokenSecret) {
      secrets.bookstackTokenId = encrypted.bookstackTokenId;
      secrets.bookstackTokenSecret = encrypted.bookstackTokenSecret;
    }
    if (anythingFromEnv && envKey) {
      secrets.anythingllmApiKey = envKey;
    } else if (encrypted.anythingllmApiKey) {
      secrets.anythingllmApiKey = encrypted.anythingllmApiKey;
    }

    return {
      secrets,
      sources: {
        bookstackToken: bookstackFromEnv
          ? "env"
          : secrets.bookstackTokenId && secrets.bookstackTokenSecret
            ? "encrypted"
            : "none",
        anythingllmApiKey: anythingFromEnv
          ? "env"
          : secrets.anythingllmApiKey
            ? "encrypted"
            : "none",
      },
    };
  }
}

export function encryptJson(data: StoredSecrets, masterKey: string): Buffer {
  const key = deriveKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: v1 | iv(12) | tag(16) | ciphertext
  return Buffer.concat([Buffer.from([1]), iv, tag, encrypted]);
}

export function decryptJson(payload: Buffer, masterKey: string): StoredSecrets {
  if (payload.length < 1 + 12 + 16 + 1 || payload[0] !== 1) {
    throw new Error("Fichier secrets illisible ou corrompu");
  }
  const key = deriveKey(masterKey);
  const iv = payload.subarray(1, 13);
  const tag = payload.subarray(13, 29);
  const ciphertext = payload.subarray(29);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as StoredSecrets;
}
