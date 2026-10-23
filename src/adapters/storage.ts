// Arquivos de clientes são privados e só acessados por URLs assinadas
// de curta duração.

export type StoredFile = { content: Uint8Array; mimeType: string };

export interface Storage {
  put(key: string, file: StoredFile): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export class StorageFake implements Storage {
  readonly files = new Map<string, StoredFile>();

  async put(key: string, file: StoredFile) {
    this.files.set(key, file);
  }

  async get(key: string) {
    return this.files.get(key) ?? null;
  }

  async delete(key: string) {
    this.files.delete(key);
  }

  async signedUrl(key: string, expiresInSeconds: number) {
    return `https://storage.fake/${encodeURIComponent(key)}?expires=${expiresInSeconds}`;
  }
}
