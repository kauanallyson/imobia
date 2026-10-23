// Arquivos de clientes são privados e só acessados por URLs assinadas
// de curta duração.

export type Arquivo = { conteudo: Uint8Array; mimeType: string };

export interface Armazenamento {
  salvar(chave: string, arquivo: Arquivo): Promise<void>;
  ler(chave: string): Promise<Arquivo | null>;
  remover(chave: string): Promise<void>;
  urlAssinada(chave: string, expiraEmSegundos: number): Promise<string>;
}

export class ArmazenamentoFalso implements Armazenamento {
  readonly arquivos = new Map<string, Arquivo>();

  async salvar(chave: string, arquivo: Arquivo) {
    this.arquivos.set(chave, arquivo);
  }

  async ler(chave: string) {
    return this.arquivos.get(chave) ?? null;
  }

  async remover(chave: string) {
    this.arquivos.delete(chave);
  }

  async urlAssinada(chave: string, expiraEmSegundos: number) {
    return `https://armazenamento.falso/${encodeURIComponent(chave)}?expira=${expiraEmSegundos}`;
  }
}
