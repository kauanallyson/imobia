import "server-only";
import { and, asc, cosineDistance, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { empreendimentos, trechosDeConhecimento } from "@/lib/db/schema";
import { gerarEmbeddings } from "@/lib/llm";
import { buscarEmpreendimento } from "./empreendimentos";
import { requireCorretor, type Session } from "./session";

// Tamanho alvo de um trecho: cabe folgado no limite do embedding e é
// pequeno o bastante para a busca devolver só o que interessa.
export const TAMANHO_DO_TRECHO = 800;

export type BaseDeConhecimento = { texto: string; trechos: number };
export type TrechoEncontrado = { texto: string; distancia: number };

const eTitulo = (paragrafo: string) => /^#{1,6}\s/.test(paragrafo);

// Parte um parágrafo maior que o limite por frases (e, em último caso, por
// palavras), nunca estourando o limite.
function partirParagrafo(paragrafo: string, limite: number): string[] {
  const partes: string[] = [];
  let atual = "";
  const unidades = paragrafo.match(/[^.!?\n]+[.!?]*\s*|\s+/g) ?? [paragrafo];
  for (const unidade of unidades) {
    if (atual.length + unidade.length > limite && atual.trim()) {
      partes.push(atual.trim());
      atual = "";
    }
    if (unidade.length > limite) {
      for (const palavra of unidade.split(/(?<=\s)/)) {
        if (atual.length + palavra.length > limite && atual.trim()) {
          partes.push(atual.trim());
          atual = "";
        }
        atual += palavra;
      }
    } else {
      atual += unidade;
    }
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

// Pura: quebra o texto da base em trechos de até `limite` caracteres.
// Parágrafos (linhas em branco) são agrupados até encher um trecho; um
// título markdown sempre abre um trecho novo; um parágrafo maior que o
// limite é partido por frases.
export function dividirEmTrechos(
  texto: string,
  limite = TAMANHO_DO_TRECHO,
): string[] {
  const paragrafos = texto
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const trechos: string[] = [];
  let atual = "";
  const fechar = () => {
    if (atual) trechos.push(atual);
    atual = "";
  };

  for (const paragrafo of paragrafos) {
    if (eTitulo(paragrafo)) fechar();
    const pedacos =
      paragrafo.length > limite
        ? partirParagrafo(paragrafo, limite)
        : [paragrafo];
    for (const pedaco of pedacos) {
      const separador = atual ? "\n\n" : "";
      if (atual && atual.length + separador.length + pedaco.length > limite) {
        fechar();
      }
      atual = atual ? `${atual}\n\n${pedaco}` : pedaco;
    }
  }
  fechar();
  return trechos;
}

// Substitui o texto e todos os trechos do empreendimento numa transação:
// editar nunca deixa trecho antigo órfão. Empreendimento fora da imobiliária
// da sessão → null.
export async function salvarBaseDeConhecimento(
  session: Session,
  input: { empreendimentoId: string; texto: string },
): Promise<BaseDeConhecimento | null> {
  const { imobiliariaId } = requireCorretor(session);
  const empreendimento = await buscarEmpreendimento(
    session,
    input.empreendimentoId,
  );
  if (!empreendimento) return null;

  const texto = input.texto.replace(/\r\n?/g, "\n").trim();
  const trechos = dividirEmTrechos(texto);
  const embeddings = await gerarEmbeddings(trechos);

  await db.transaction(async (tx) => {
    const dono = and(
      eq(empreendimentos.id, empreendimento.id),
      eq(empreendimentos.imobiliariaId, imobiliariaId),
    );
    await tx
      .update(empreendimentos)
      .set({ baseDeConhecimento: texto || null })
      .where(dono);
    await tx
      .delete(trechosDeConhecimento)
      .where(eq(trechosDeConhecimento.empreendimentoId, empreendimento.id));
    if (trechos.length > 0) {
      await tx.insert(trechosDeConhecimento).values(
        trechos.map((t, ordem) => ({
          empreendimentoId: empreendimento.id,
          imobiliariaId,
          ordem,
          texto: t,
          embedding: embeddings[ordem] as number[],
        })),
      );
    }
  });

  return { texto, trechos: trechos.length };
}

export async function buscarBaseDeConhecimento(
  session: Session,
  empreendimentoId: string,
): Promise<BaseDeConhecimento | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(empreendimentoId).success) return null;
  const [found] = await db
    .select({ texto: empreendimentos.baseDeConhecimento })
    .from(empreendimentos)
    .where(
      and(
        eq(empreendimentos.id, empreendimentoId),
        eq(empreendimentos.imobiliariaId, imobiliariaId),
      ),
    );
  if (!found) return null;
  const trechos = await db
    .select({ id: trechosDeConhecimento.id })
    .from(trechosDeConhecimento)
    .where(eq(trechosDeConhecimento.empreendimentoId, empreendimentoId));
  return { texto: found.texto ?? "", trechos: trechos.length };
}

// Os `limite` trechos mais próximos da pergunta (distância de cosseno, menor
// é melhor), sempre filtrados pela imobiliária da sessão e pelo
// empreendimento. Empreendimento de outra imobiliária → null.
export async function buscarNaBaseDeConhecimento(
  session: Session,
  input: { empreendimentoId: string; pergunta: string; limite?: number },
): Promise<TrechoEncontrado[] | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!(await buscarEmpreendimento(session, input.empreendimentoId))) {
    return null;
  }
  const pergunta = input.pergunta.trim();
  if (!pergunta) return [];
  const [embedding] = await gerarEmbeddings([pergunta]);
  if (!embedding) return [];

  const distancia = cosineDistance(trechosDeConhecimento.embedding, embedding);
  const rows = await db
    .select({ texto: trechosDeConhecimento.texto, distancia })
    .from(trechosDeConhecimento)
    .where(
      and(
        eq(trechosDeConhecimento.imobiliariaId, imobiliariaId),
        eq(trechosDeConhecimento.empreendimentoId, input.empreendimentoId),
      ),
    )
    .orderBy(asc(distancia))
    .limit(input.limite ?? 5);
  return rows.map((r) => ({ texto: r.texto, distancia: Number(r.distancia) }));
}
