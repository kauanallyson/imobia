import "server-only";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { empreendimentos, modelosDeCasa } from "@/lib/db/schema";
import { buscarEmpreendimento } from "./empreendimentos";
import { requireCorretor, type Session } from "./session";

const columns = {
  id: modelosDeCasa.id,
  empreendimentoId: modelosDeCasa.empreendimentoId,
  nome: modelosDeCasa.nome,
  areaConstruida: modelosDeCasa.areaConstruida,
  quartos: modelosDeCasa.quartos,
  banheiros: modelosDeCasa.banheiros,
  suites: modelosDeCasa.suites,
  vagas: modelosDeCasa.vagas,
  preco: modelosDeCasa.preco,
};

export type ModeloDeCasa = {
  id: string;
  empreendimentoId: string;
  nome: string;
  areaConstruida: number;
  quartos: number;
  banheiros: number;
  suites: number;
  vagas: number;
  preco: number;
};

export type DadosDoModeloDeCasa = Omit<ModeloDeCasa, "id" | "empreendimentoId">;

function selecionar(imobiliariaId: string, where: SQL) {
  return db
    .select(columns)
    .from(modelosDeCasa)
    .innerJoin(
      empreendimentos,
      eq(empreendimentos.id, modelosDeCasa.empreendimentoId),
    )
    .where(and(eq(empreendimentos.imobiliariaId, imobiliariaId), where));
}

export async function criarModeloDeCasa(
  session: Session,
  input: { id?: string; empreendimentoId: string } & DadosDoModeloDeCasa,
): Promise<ModeloDeCasa | null> {
  requireCorretor(session);
  if (!(await buscarEmpreendimento(session, input.empreendimentoId))) {
    return null;
  }
  const [created] = await db
    .insert(modelosDeCasa)
    .values({ ...input, criadoEm: new Date() })
    .onConflictDoNothing({ target: modelosDeCasa.id })
    .returning(columns);
  if (created) return created;
  return input.id ? buscarModeloDeCasa(session, input.id) : null;
}

export async function buscarModeloDeCasa(
  session: Session,
  id: string,
): Promise<ModeloDeCasa | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await selecionar(imobiliariaId, eq(modelosDeCasa.id, id));
  return found ?? null;
}

export async function listarModelosDeCasa(
  session: Session,
  empreendimentoId: string,
): Promise<ModeloDeCasa[]> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(empreendimentoId).success) return [];
  return selecionar(
    imobiliariaId,
    eq(modelosDeCasa.empreendimentoId, empreendimentoId),
  ).orderBy(asc(modelosDeCasa.nome));
}

export async function editarModeloDeCasa(
  session: Session,
  id: string,
  input: DadosDoModeloDeCasa,
): Promise<ModeloDeCasa | null> {
  const modelo = await buscarModeloDeCasa(session, id);
  if (!modelo) return null;
  const [edited] = await db
    .update(modelosDeCasa)
    .set(input)
    .where(eq(modelosDeCasa.id, modelo.id))
    .returning(columns);
  return edited ?? null;
}
