import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { negocioEtapas, negocios } from "@/lib/db/schema";
import { requireCorretor } from "./clientes";
import type { Session } from "./session";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const negocioColumns = {
  id: negocios.id,
  clienteId: negocios.clienteId,
  etapa: negocios.etapa,
  motivoPerda: negocios.motivoPerda,
  criadoEm: negocios.criadoEm,
  atualizadoEm: negocios.atualizadoEm,
};

// Todo negócio nasce em Novo com a primeira linha do histórico. Usado dentro
// da transação de quem o cria (mensagem de número novo, cadastro manual).
export async function inserirNegocioEmNovo(
  tx: Tx,
  input: { imobiliariaId: string; corretorId: string; clienteId: string },
) {
  const agora = new Date();
  const [negocio] = await tx
    .insert(negocios)
    .values({ ...input, etapa: "novo", criadoEm: agora, atualizadoEm: agora })
    .returning(negocioColumns);
  if (!negocio) throw new Error("negócio não inserido");
  await tx
    .insert(negocioEtapas)
    .values({ negocioId: negocio.id, de: null, para: "novo", em: agora });
  return negocio;
}

export async function listarNegocios(session: Session) {
  const { corretorId } = requireCorretor(session);
  return db
    .select(negocioColumns)
    .from(negocios)
    .where(eq(negocios.corretorId, corretorId))
    .orderBy(desc(negocios.atualizadoEm));
}

export async function historicoDeEtapas(session: Session, negocioId: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return [];
  return db
    .select({
      de: negocioEtapas.de,
      para: negocioEtapas.para,
      em: negocioEtapas.em,
    })
    .from(negocioEtapas)
    .innerJoin(negocios, eq(negocios.id, negocioEtapas.negocioId))
    .where(and(eq(negocios.id, negocioId), eq(negocios.corretorId, corretorId)))
    .orderBy(asc(negocioEtapas.em));
}
