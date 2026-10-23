import "server-only";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  type DestinoDoMaterial,
  empreendimentos,
  materiaisDeMarketing,
  type TipoDeArquivo,
} from "@/lib/db/schema";
import { apagarArquivo, salvarArquivo, urlAssinada } from "@/lib/storage";
import { buscarEmpreendimento } from "./empreendimentos";
import { requireCorretor, type Session } from "./session";

export type { DestinoDoMaterial, TipoDeArquivo };

const columns = {
  id: materiaisDeMarketing.id,
  empreendimentoId: materiaisDeMarketing.empreendimentoId,
  nome: materiaisDeMarketing.nome,
  tipoDeArquivo: materiaisDeMarketing.tipoDeArquivo,
  destino: materiaisDeMarketing.destino,
  contentType: materiaisDeMarketing.contentType,
  tamanho: materiaisDeMarketing.tamanho,
  enviadoEm: materiaisDeMarketing.enviadoEm,
};

// A chave do storage fica fora do DTO: a interface só vê URLs assinadas.
export type MaterialDeMarketing = {
  id: string;
  empreendimentoId: string;
  nome: string;
  tipoDeArquivo: TipoDeArquivo;
  destino: DestinoDoMaterial;
  contentType: string;
  tamanho: number;
  enviadoEm: Date;
};

// Duração da URL assinada de download.
const TTL_SEGUNDOS = 15 * 60;

export function chaveDoMaterial(
  imobiliariaId: string,
  empreendimentoId: string,
  materialId: string,
) {
  return `imobiliarias/${imobiliariaId}/empreendimentos/${empreendimentoId}/materiais/${materialId}`;
}

function selecionar(imobiliariaId: string, where: SQL) {
  return db
    .select(columns)
    .from(materiaisDeMarketing)
    .innerJoin(
      empreendimentos,
      eq(empreendimentos.id, materiaisDeMarketing.empreendimentoId),
    )
    .where(and(eq(empreendimentos.imobiliariaId, imobiliariaId), where));
}

// Idempotente pelo `id` do formulário: o registro é gravado primeiro (quem
// perder o conflito relê e não envia o arquivo de novo); o arquivo vai para
// o storage em seguida. Se o upload falhar, o registro é desfeito.
export async function enviarMaterialDeMarketing(
  session: Session,
  input: {
    id?: string;
    empreendimentoId: string;
    nome: string;
    tipoDeArquivo: TipoDeArquivo;
    destino: DestinoDoMaterial;
    contentType: string;
    conteudo: Uint8Array | ArrayBuffer | Blob;
  },
): Promise<MaterialDeMarketing | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!(await buscarEmpreendimento(session, input.empreendimentoId))) {
    return null;
  }
  const id = input.id ?? crypto.randomUUID();
  const chave = chaveDoMaterial(imobiliariaId, input.empreendimentoId, id);
  const tamanho =
    input.conteudo instanceof Blob
      ? input.conteudo.size
      : input.conteudo.byteLength;

  const [created] = await db
    .insert(materiaisDeMarketing)
    .values({
      id,
      empreendimentoId: input.empreendimentoId,
      nome: input.nome,
      tipoDeArquivo: input.tipoDeArquivo,
      destino: input.destino,
      chave,
      contentType: input.contentType,
      tamanho,
      enviadoEm: new Date(),
    })
    .onConflictDoNothing({ target: materiaisDeMarketing.id })
    .returning(columns);
  if (!created) return buscarMaterialDeMarketing(session, id);

  try {
    await salvarArquivo(chave, input.conteudo, input.contentType);
  } catch (error) {
    await db
      .delete(materiaisDeMarketing)
      .where(eq(materiaisDeMarketing.id, created.id));
    throw error;
  }
  return created;
}

export async function buscarMaterialDeMarketing(
  session: Session,
  id: string,
): Promise<MaterialDeMarketing | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await selecionar(
    imobiliariaId,
    eq(materiaisDeMarketing.id, id),
  );
  return found ?? null;
}

export async function listarMateriaisDeMarketing(
  session: Session,
  empreendimentoId: string,
): Promise<MaterialDeMarketing[]> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(empreendimentoId).success) return [];
  return selecionar(
    imobiliariaId,
    eq(materiaisDeMarketing.empreendimentoId, empreendimentoId),
  ).orderBy(desc(materiaisDeMarketing.enviadoEm));
}

// O material que o assistente envia a quem quer "lote" ou "lote + casa":
// os marcados para esse destino mais os marcados como "ambos".
export async function materiaisPara(
  session: Session,
  empreendimentoId: string,
  interesse: "lote" | "lote_e_casa",
): Promise<MaterialDeMarketing[]> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(empreendimentoId).success) return [];
  return selecionar(
    imobiliariaId,
    and(
      eq(materiaisDeMarketing.empreendimentoId, empreendimentoId),
      inArray(materiaisDeMarketing.destino, [interesse, "ambos"]),
    ) as SQL,
  ).orderBy(asc(materiaisDeMarketing.nome));
}

// URL assinada de curta duração para baixar/exibir o arquivo.
export async function urlDoMaterial(
  session: Session,
  id: string,
): Promise<string | null> {
  const { imobiliariaId } = requireCorretor(session);
  const material = await buscarMaterialDeMarketing(session, id);
  if (!material) return null;
  return urlAssinada(
    chaveDoMaterial(imobiliariaId, material.empreendimentoId, material.id),
    TTL_SEGUNDOS,
  );
}

// Apaga o objeto no storage e depois o registro. true se removeu agora;
// false se já não existia (ou está fora do escopo). Repetir não falha.
export async function removerMaterialDeMarketing(
  session: Session,
  id: string,
): Promise<boolean> {
  const { imobiliariaId } = requireCorretor(session);
  const material = await buscarMaterialDeMarketing(session, id);
  if (!material) return false;
  await apagarArquivo(
    chaveDoMaterial(imobiliariaId, material.empreendimentoId, material.id),
  );
  const removed = await db
    .delete(materiaisDeMarketing)
    .where(eq(materiaisDeMarketing.id, material.id))
    .returning({ id: materiaisDeMarketing.id });
  return removed.length > 0;
}
