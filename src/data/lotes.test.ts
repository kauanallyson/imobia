import { describe, expect, test } from "bun:test";
import {
  criarAna,
  criarBruno,
  criarConcorrente,
  criarEmpreendimentoDaAna,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import {
  alterarStatusDoLote,
  buscarLote,
  criarLote,
  editarLote,
  LoteDuplicadoError,
  listarLotes,
} from "./lotes";

const loteA1 = {
  quadra: "A",
  numero: "1",
  area: 360,
  frente: 12,
  fundo: 30,
  preco: 85000,
};

describe("lotes", () => {
  test("corretor cadastra um lote disponível e outro corretor da imobiliária o vê", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const bruno = await criarBruno(imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(
      sessaoDe(corretor, imobiliaria),
    );

    const lote = ok(
      await criarLote(sessaoDe(corretor, imobiliaria), {
        empreendimentoId: empreendimento.id,
        ...loteA1,
      }),
    );

    expect(lote).toEqual({
      id: expect.any(String),
      empreendimentoId: empreendimento.id,
      ...loteA1,
      status: "disponivel",
    });
    expect(
      await listarLotes(sessaoDe(bruno, imobiliaria), empreendimento.id),
    ).toEqual([lote]);
  });

  test("quadra + número é único por empreendimento", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    await criarLote(session, {
      empreendimentoId: empreendimento.id,
      ...loteA1,
    });

    await expect(
      criarLote(session, {
        empreendimentoId: empreendimento.id,
        ...loteA1,
        preco: 90000,
      }),
    ).rejects.toBeInstanceOf(LoteDuplicadoError);
    expect(await listarLotes(session, empreendimento.id)).toHaveLength(1);
  });

  test("editar para uma quadra + número já usados também é recusado", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    await criarLote(session, {
      empreendimentoId: empreendimento.id,
      ...loteA1,
    });
    const a2 = ok(
      await criarLote(session, {
        empreendimentoId: empreendimento.id,
        ...loteA1,
        numero: "2",
      }),
    );

    await expect(editarLote(session, a2.id, loteA1)).rejects.toBeInstanceOf(
      LoteDuplicadoError,
    );
  });

  test("mudança de status feita por um corretor aparece para outro da mesma imobiliária e é idempotente", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const bruno = await criarBruno(imobiliaria);
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const lote = ok(
      await criarLote(session, {
        empreendimentoId: empreendimento.id,
        ...loteA1,
      }),
    );

    const reservado = await alterarStatusDoLote(session, lote.id, "reservado");
    const again = await alterarStatusDoLote(
      sessaoDe(bruno, imobiliaria),
      lote.id,
      "reservado",
    );

    expect(reservado?.status).toBe("reservado");
    expect(again).toEqual(reservado);
    expect(await buscarLote(sessaoDe(bruno, imobiliaria), lote.id)).toEqual(
      reservado,
    );
  });

  test("corretor edita as medidas e o preço do lote", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const lote = ok(
      await criarLote(session, {
        empreendimentoId: empreendimento.id,
        ...loteA1,
      }),
    );

    const edited = await editarLote(session, lote.id, {
      ...loteA1,
      numero: "2",
      preco: 99000.5,
    });

    expect(edited).toEqual({ ...lote, numero: "2", preco: 99000.5 });
  });

  test("outra imobiliária não vê, não busca, não edita nem muda o status do lote", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const concorrente = await criarConcorrente();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const lote = ok(
      await criarLote(session, {
        empreendimentoId: empreendimento.id,
        ...loteA1,
      }),
    );

    expect(
      await criarLote(concorrente.session, {
        empreendimentoId: empreendimento.id,
        ...loteA1,
        numero: "9",
      }),
    ).toBeNull();
    expect(await listarLotes(concorrente.session, empreendimento.id)).toEqual(
      [],
    );
    expect(await buscarLote(concorrente.session, lote.id)).toBeNull();
    expect(await editarLote(concorrente.session, lote.id, loteA1)).toBeNull();
    expect(
      await alterarStatusDoLote(concorrente.session, lote.id, "vendido"),
    ).toBeNull();
    expect((await buscarLote(session, lote.id))?.status).toBe("disponivel");
  });

  test("repetir a criação com o mesmo id não duplica", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const input = {
      id: crypto.randomUUID(),
      empreendimentoId: empreendimento.id,
      ...loteA1,
    };

    const [first, second] = await Promise.all([
      criarLote(session, input),
      criarLote(session, input),
    ]);
    const again = await criarLote(session, input);

    expect(second).toEqual(first);
    expect(again).toEqual(first);
    expect(await listarLotes(session, empreendimento.id)).toHaveLength(1);
  });
});
