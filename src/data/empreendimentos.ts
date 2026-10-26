import "server-only";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { empreendimentos, incorporadoras } from "@/lib/db/schema";
import { buscarIncorporadora } from "./incorporadoras";
import { requireCorretor, type Session } from "./session";

const columns = {
  id: empreendimentos.id,
  nome: empreendimentos.nome,
  cidade: empreendimentos.cidade,
  endereco: empreendimentos.endereco,
  latitude: empreendimentos.latitude,
  longitude: empreendimentos.longitude,
  incorporadoraId: empreendimentos.incorporadoraId,
  incorporadora: incorporadoras.nome,
};

export type Empreendimento = {
  id: string;
  nome: string;
  cidade: string;
  endereco: string;
  // Coordenadas do ponto de encontro (ticket 13); opcionais.
  latitude: number | null;
  longitude: number | null;
  incorporadoraId: string;
  incorporadora: string;
};

export type NovoEmpreendimento = {
  incorporadoraId: string;
  nome: string;
  cidade: string;
  endereco: string;
  latitude?: number | null;
  longitude?: number | null;
};

function selecionar(where: SQL) {
  return db
    .select(columns)
    .from(empreendimentos)
    .innerJoin(
      incorporadoras,
      eq(incorporadoras.id, empreendimentos.incorporadoraId),
    )
    .where(where);
}

// Idempotente pelo `id` do formulário. A incorporadora precisa ser da mesma
// imobiliária; fora disso devolve null.
export async function criarEmpreendimento(
  session: Session,
  input: { id?: string } & NovoEmpreendimento,
): Promise<Empreendimento | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!(await buscarIncorporadora(session, input.incorporadoraId))) return null;
  const [created] = await db
    .insert(empreendimentos)
    .values({ ...input, imobiliariaId, criadoEm: new Date() })
    .onConflictDoNothing({ target: empreendimentos.id })
    .returning({ id: empreendimentos.id });
  const id = created?.id ?? input.id;
  return id ? buscarEmpreendimento(session, id) : null;
}

export async function buscarEmpreendimento(
  session: Session,
  id: string,
): Promise<Empreendimento | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await selecionar(
    and(
      eq(empreendimentos.id, id),
      eq(empreendimentos.imobiliariaId, imobiliariaId),
    ) as SQL,
  );
  return found ?? null;
}

export async function listarEmpreendimentos(
  session: Session,
): Promise<Empreendimento[]> {
  const { imobiliariaId } = requireCorretor(session);
  return selecionar(eq(empreendimentos.imobiliariaId, imobiliariaId)).orderBy(
    asc(empreendimentos.nome),
  );
}

export async function editarEmpreendimento(
  session: Session,
  id: string,
  input: NovoEmpreendimento,
): Promise<Empreendimento | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  if (!(await buscarIncorporadora(session, input.incorporadoraId))) return null;
  const [edited] = await db
    .update(empreendimentos)
    .set(input)
    .where(
      and(
        eq(empreendimentos.id, id),
        eq(empreendimentos.imobiliariaId, imobiliariaId),
      ),
    )
    .returning({ id: empreendimentos.id });
  return edited ? buscarEmpreendimento(session, edited.id) : null;
}
