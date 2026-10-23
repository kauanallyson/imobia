import type { Storage, StoredFile } from "@/domain/ports/storage";

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
