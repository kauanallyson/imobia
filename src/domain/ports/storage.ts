// Arquivos de clientes são privados e só acessados por URLs assinadas
// de curta duração.

export type StoredFile = { content: Uint8Array; mimeType: string };

export interface Storage {
  put(key: string, file: StoredFile): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
