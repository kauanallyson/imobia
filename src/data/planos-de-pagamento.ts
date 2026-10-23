import "server-only";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { empreendimentos, planosDePagamento } from "@/lib/db/schema";
import { buscarEmpreendimento } from "./empreendimentos";
import { buscarLote } from "./lotes";
import { buscarModeloDeCasa } from "./modelos-de-casa";
import { requireCorretor, type Session } from "./session";

const columns = {
  id: planosDePagamento.id,
  empreendimentoId: planosDePagamento.empreendimentoId,
  nome: planosDePagamento.nome,
  percentualDeEntrada: planosDePagamento.percentualDeEntrada,
  numeroDeParcelas: planosDePagamento.numeroDeParcelas,
  condicoes: planosDePagamento.condicoes,
};

export type PlanoDePagamento = {
  id: string;
  empreendimentoId: string;
  nome: string;
  percentualDeEntrada: number;
  numeroDeParcelas: number;
  condicoes: string;
};

export type DadosDoPlano = Omit<PlanoDePagamento, "id" | "empreendimentoId">;

// ---- Cálculo ---------------------------------------------------------------

export type ResultadoDoPlano = {
  entrada: number;
  parcela: number;
  parcelas: number;
};

// ÚNICO ponto que calcula entrada e parcela (spec → Dados → Plano de
// pagamento). Regra PROVISÓRIA, sem taxas nem correção; a definitiva
// substitui só esta função.
//
// Valores em reais, mas a conta é feita em centavos inteiros:
// - entrada = piso(preço × percentual), em centavos (o cliente nunca paga
//   mais de entrada do que o percentual anunciado);
// - parcela = teto((preço − entrada) ÷ parcelas), em centavos (a soma das
//   parcelas nunca fica abaixo do saldo; a última pode vir alguns centavos
//   menor na proposta).
// O percentual aceita até duas casas (ex.: 12,5) e é tratado como pontos-base
// inteiros para não propagar erro de ponto flutuante.
export function calcularPlano({
  precoTotal,
  plano,
}: {
  precoTotal: number;
  plano: { percentualDeEntrada: number; numeroDeParcelas: number };
}): ResultadoDoPlano {
  const precoCentavos = Math.round(precoTotal * 100);
  const pontosBase = Math.round(plano.percentualDeEntrada * 100);
  const entradaCentavos = Math.floor((precoCentavos * pontosBase) / 10000);
  const saldoCentavos = precoCentavos - entradaCentavos;
  const parcelas = Math.max(1, Math.trunc(plano.numeroDeParcelas));
  const parcelaCentavos = Math.ceil(saldoCentavos / parcelas);
  return {
    entrada: entradaCentavos / 100,
    parcela: parcelaCentavos / 100,
    parcelas,
  };
}

// Preço do lote (ou lote + casa) passado por `calcularPlano`. Tudo precisa
// estar na imobiliária da sessão e no mesmo empreendimento; senão null.
export async function calcularPlanoParaLote(
  session: Session,
  input: { loteId: string; modeloDeCasaId?: string; planoId: string },
): Promise<(ResultadoDoPlano & { precoTotal: number }) | null> {
  const [lote, plano, modelo] = await Promise.all([
    buscarLote(session, input.loteId),
    buscarPlanoDePagamento(session, input.planoId),
    input.modeloDeCasaId
      ? buscarModeloDeCasa(session, input.modeloDeCasaId)
      : Promise.resolve(undefined),
  ]);
  if (!lote || !plano || modelo === null) return null;
  if (plano.empreendimentoId !== lote.empreendimentoId) return null;
  if (modelo && modelo.empreendimentoId !== lote.empreendimentoId) return null;

  const precoTotal =
    (Math.round(lote.preco * 100) + Math.round((modelo?.preco ?? 0) * 100)) /
    100;
  return { precoTotal, ...calcularPlano({ precoTotal, plano }) };
}

// ---- CRUD ------------------------------------------------------------------

function selecionar(imobiliariaId: string, where: SQL) {
  return db
    .select(columns)
    .from(planosDePagamento)
    .innerJoin(
      empreendimentos,
      eq(empreendimentos.id, planosDePagamento.empreendimentoId),
    )
    .where(and(eq(empreendimentos.imobiliariaId, imobiliariaId), where));
}

export async function criarPlanoDePagamento(
  session: Session,
  input: { id?: string; empreendimentoId: string } & DadosDoPlano,
): Promise<PlanoDePagamento | null> {
  requireCorretor(session);
  if (!(await buscarEmpreendimento(session, input.empreendimentoId))) {
    return null;
  }
  const [created] = await db
    .insert(planosDePagamento)
    .values({ ...input, criadoEm: new Date() })
    .onConflictDoNothing({ target: planosDePagamento.id })
    .returning(columns);
  if (created) return created;
  return input.id ? buscarPlanoDePagamento(session, input.id) : null;
}

export async function buscarPlanoDePagamento(
  session: Session,
  id: string,
): Promise<PlanoDePagamento | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await selecionar(imobiliariaId, eq(planosDePagamento.id, id));
  return found ?? null;
}

export async function listarPlanosDePagamento(
  session: Session,
  empreendimentoId: string,
): Promise<PlanoDePagamento[]> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(empreendimentoId).success) return [];
  return selecionar(
    imobiliariaId,
    eq(planosDePagamento.empreendimentoId, empreendimentoId),
  ).orderBy(asc(planosDePagamento.nome));
}

export async function editarPlanoDePagamento(
  session: Session,
  id: string,
  input: DadosDoPlano,
): Promise<PlanoDePagamento | null> {
  const plano = await buscarPlanoDePagamento(session, id);
  if (!plano) return null;
  const [edited] = await db
    .update(planosDePagamento)
    .set(input)
    .where(eq(planosDePagamento.id, plano.id))
    .returning(columns);
  return edited ?? null;
}

// true se removeu agora; false se já não existia (ou está fora do escopo).
export async function removerPlanoDePagamento(
  session: Session,
  id: string,
): Promise<boolean> {
  const plano = await buscarPlanoDePagamento(session, id);
  if (!plano) return false;
  const removed = await db
    .delete(planosDePagamento)
    .where(eq(planosDePagamento.id, plano.id))
    .returning({ id: planosDePagamento.id });
  return removed.length > 0;
}
