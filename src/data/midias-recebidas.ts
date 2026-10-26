import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  arquivosDoFechamento,
  conversas,
  documentosDoCliente,
  mensagens,
  whatsappConexoes,
} from "@/lib/db/schema";
import * as storage from "@/lib/storage";
import * as whatsapp from "@/lib/whatsapp";

// Fotos e arquivos que o cliente mandou na conversa do negócio e que a coleta
// (documentos do cliente) e o fechamento (proposta assinada, comprovante)
// registram. Uma mídia vira no máximo um registro, em um dos dois módulos.

type NegocioDaMidia = { clienteId: string; corretorId: string };

export type MidiaRecebida = {
  mensagemId: string;
  evolutionId: string;
  documentoId: string | null;
  arquivo: { id: string; tipo: string; chave: string } | null;
};

const ehPdf = sql`(${mensagens.midia}->>'mimetype' = 'application/pdf' or lower(${mensagens.midia}->>'nomeDoArquivo') like '%.pdf')`;

// As mídias do cliente desde `desde`, da mais antiga para a mais nova, com o
// registro que cada uma já virou (documento ou arquivo do fechamento).
export async function midiasRecebidas(
  negocio: NegocioDaMidia,
  filtro: { desde: Date | null; soPdf?: boolean },
): Promise<MidiaRecebida[]> {
  const rows = await db
    .select({
      mensagemId: mensagens.id,
      evolutionId: mensagens.evolutionId,
      documentoId: documentosDoCliente.id,
      arquivoId: arquivosDoFechamento.id,
      arquivoTipo: arquivosDoFechamento.tipo,
      arquivoChave: arquivosDoFechamento.chave,
    })
    .from(mensagens)
    .innerJoin(conversas, eq(conversas.id, mensagens.conversaId))
    .leftJoin(
      documentosDoCliente,
      eq(documentosDoCliente.mensagemId, mensagens.id),
    )
    .leftJoin(
      arquivosDoFechamento,
      eq(arquivosDoFechamento.mensagemId, mensagens.id),
    )
    .where(
      and(
        eq(conversas.clienteId, negocio.clienteId),
        eq(conversas.corretorId, negocio.corretorId),
        eq(mensagens.autor, "cliente"),
        isNotNull(mensagens.evolutionId),
        filtro.soPdf
          ? and(sql`${mensagens.midia}->>'tipo' = 'documento'`, ehPdf)
          : inArray(sql`${mensagens.midia}->>'tipo'`, ["imagem", "documento"]),
        filtro.desde ? gte(mensagens.enviadaEm, filtro.desde) : undefined,
      ),
    )
    .orderBy(asc(mensagens.enviadaEm), asc(mensagens.criadaEm));
  return rows.map((r) => ({
    mensagemId: r.mensagemId,
    evolutionId: r.evolutionId ?? "",
    documentoId: r.documentoId,
    arquivo:
      r.arquivoId && r.arquivoTipo && r.arquivoChave
        ? { id: r.arquivoId, tipo: r.arquivoTipo, chave: r.arquivoChave }
        : null,
  }));
}

// A primeira mídia que ainda não virou registro em nenhum dos dois módulos.
export function proximaNaoRegistrada(midias: MidiaRecebida[]) {
  return midias.find((m) => !m.documentoId && !m.arquivo) ?? null;
}

// Baixa a mídia da Evolution e a guarda privada no storage em `chave`. Sem
// WhatsApp pareado → null.
export async function guardarMidiaRecebida(
  negocio: NegocioDaMidia,
  midia: MidiaRecebida,
  chave: string,
): Promise<Awaited<ReturnType<typeof whatsapp.baixarMidia>> | null> {
  const [conexao] = await db
    .select({ instancia: whatsappConexoes.instancia })
    .from(whatsappConexoes)
    .where(eq(whatsappConexoes.corretorId, negocio.corretorId));
  if (!conexao?.instancia) return null;
  const baixado = await whatsapp.baixarMidia(
    conexao.instancia,
    midia.evolutionId,
  );
  await storage.salvarArquivo(chave, baixado.bytes, baixado.mimeType);
  return baixado;
}
