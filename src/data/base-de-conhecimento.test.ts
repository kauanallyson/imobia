import { describe, expect, test } from "bun:test";
import { embeddingsPedidos } from "@/test/fakes/llm";
import {
  administrador,
  criarAna,
  criarBruno,
  criarConcorrente,
  criarEmpreendimentoDaAna,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import {
  buscarBaseDeConhecimento,
  buscarNaBaseDeConhecimento,
  dividirEmTrechos,
  salvarBaseDeConhecimento,
} from "./base-de-conhecimento";
import { ForbiddenError } from "./session";

const base = `# Localização
O Jardim das Flores fica na Rod. CE-178, km 2, a dez minutos do centro de Sobral.

# Infraestrutura
Ruas asfaltadas, energia elétrica, água encanada e iluminação pública em todas as quadras.

# Perguntas frequentes
Aceita financiamento bancário? Sim, pela Caixa e pelo Banco do Brasil.`;

describe("dividirEmTrechos", () => {
  test("texto vazio não gera trechos", () => {
    expect(dividirEmTrechos("")).toEqual([]);
    expect(dividirEmTrechos("  \n\n  ")).toEqual([]);
  });

  test("parágrafos curtos são agrupados num trecho só", () => {
    const texto =
      "Localização: Rod. CE-178, km 2.\n\nInfraestrutura: asfalto e energia.";
    expect(dividirEmTrechos(texto)).toEqual([
      "Localização: Rod. CE-178, km 2.\n\nInfraestrutura: asfalto e energia.",
    ]);
  });

  test("um título markdown começa um trecho novo", () => {
    const texto =
      "# Localização\nFica na CE-178.\n\n# Perguntas frequentes\nTem água encanada? Sim.";
    expect(dividirEmTrechos(texto)).toEqual([
      "# Localização\nFica na CE-178.",
      "# Perguntas frequentes\nTem água encanada? Sim.",
    ]);
  });

  test("parágrafos são agrupados até cerca de 800 caracteres", () => {
    const paragrafo = "a".repeat(300);
    const texto = [paragrafo, paragrafo, paragrafo, paragrafo].join("\n\n");
    const trechos = dividirEmTrechos(texto);
    expect(trechos).toEqual([
      `${paragrafo}\n\n${paragrafo}`,
      `${paragrafo}\n\n${paragrafo}`,
    ]);
  });

  test("um parágrafo gigante é partido por frases", () => {
    const frase = "Esta frase tem exatamente quarenta letras ok. ";
    const texto = frase.repeat(40).trim(); // ~1880 chars sem quebra de linha
    const trechos = dividirEmTrechos(texto);
    expect(trechos.length).toBeGreaterThan(1);
    for (const t of trechos) expect(t.length).toBeLessThanOrEqual(800);
    expect(trechos.join(" ")).toBe(texto);
  });
});

describe("base de conhecimento", () => {
  test("corretor salva a base e outro corretor da imobiliária a lê", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const bruno = await criarBruno(imobiliaria);
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);

    const salva = await salvarBaseDeConhecimento(session, {
      empreendimentoId: empreendimento.id,
      texto: base,
    });

    expect(salva).toEqual({ texto: base, trechos: 3 });
    expect(
      await buscarBaseDeConhecimento(
        sessaoDe(bruno, imobiliaria),
        empreendimento.id,
      ),
    ).toEqual(salva);
    // Embeddings passam por src/lib/llm.ts (o falso registra a chamada).
    expect(embeddingsPedidos).toEqual([dividirEmTrechos(base)]);
  });

  test("empreendimento sem base devolve texto vazio", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);

    expect(await buscarBaseDeConhecimento(session, empreendimento.id)).toEqual({
      texto: "",
      trechos: 0,
    });
    expect(await buscarBaseDeConhecimento(session, "nao-uuid")).toBeNull();
  });

  test("busca devolve o trecho relevante do empreendimento pedido", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    await salvarBaseDeConhecimento(session, {
      empreendimentoId: empreendimento.id,
      texto: base,
    });

    const trechos = ok(
      await buscarNaBaseDeConhecimento(session, {
        empreendimentoId: empreendimento.id,
        pergunta: "Aceita financiamento pela Caixa?",
        limite: 2,
      }),
    );

    expect(trechos).toHaveLength(2);
    expect(trechos[0]?.texto).toContain("Aceita financiamento bancário?");
    expect(trechos[0]?.distancia).toBeLessThan(trechos[1]?.distancia ?? 0);
  });

  test("salvar de novo reindexa e não deixa trechos órfãos", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    await salvarBaseDeConhecimento(session, {
      empreendimentoId: empreendimento.id,
      texto: base,
    });

    const nova = "# Lazer\nPiscina, quadra poliesportiva e salão de festas.";
    const salva = await salvarBaseDeConhecimento(session, {
      empreendimentoId: empreendimento.id,
      texto: nova,
    });

    expect(salva).toEqual({ texto: nova, trechos: 1 });
    const trechos = ok(
      await buscarNaBaseDeConhecimento(session, {
        empreendimentoId: empreendimento.id,
        pergunta: "financiamento bancário Caixa",
        limite: 10,
      }),
    );
    expect(trechos.map((t) => t.texto)).toEqual([nova]);

    const vazia = await salvarBaseDeConhecimento(session, {
      empreendimentoId: empreendimento.id,
      texto: "   ",
    });
    expect(vazia).toEqual({ texto: "", trechos: 0 });
    expect(
      await buscarNaBaseDeConhecimento(session, {
        empreendimentoId: empreendimento.id,
        pergunta: "piscina",
      }),
    ).toEqual([]);
  });

  test("busca nunca devolve trechos de outra imobiliária", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const ana = sessaoDe(corretor, imobiliaria);
    const concorrente = await criarConcorrente();
    const daAna = await criarEmpreendimentoDaAna(ana);
    const daCarla = await criarEmpreendimentoDaAna(concorrente.session);
    await salvarBaseDeConhecimento(ana, {
      empreendimentoId: daAna.empreendimento.id,
      texto: "# Lazer\nPiscina aquecida e quadra de tênis.",
    });
    await salvarBaseDeConhecimento(concorrente.session, {
      empreendimentoId: daCarla.empreendimento.id,
      texto: "# Lazer\nPiscina aquecida e quadra de tênis.",
    });

    // Pelo empreendimento da própria imobiliária: só os trechos dela.
    const trechos = ok(
      await buscarNaBaseDeConhecimento(ana, {
        empreendimentoId: daAna.empreendimento.id,
        pergunta: "piscina aquecida",
        limite: 10,
      }),
    );
    expect(trechos).toHaveLength(1);

    // Pelo empreendimento da outra imobiliária: nada, nem ler nem escrever.
    expect(
      await buscarNaBaseDeConhecimento(ana, {
        empreendimentoId: daCarla.empreendimento.id,
        pergunta: "piscina aquecida",
      }),
    ).toBeNull();
    expect(
      await buscarBaseDeConhecimento(ana, daCarla.empreendimento.id),
    ).toBeNull();
    expect(
      await salvarBaseDeConhecimento(ana, {
        empreendimentoId: daCarla.empreendimento.id,
        texto: "invasão",
      }),
    ).toBeNull();
    expect(
      await buscarBaseDeConhecimento(
        concorrente.session,
        daCarla.empreendimento.id,
      ),
    ).toEqual({
      texto: "# Lazer\nPiscina aquecida e quadra de tênis.",
      trechos: 1,
    });
  });

  test("administrador não mexe na base de conhecimento", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const { empreendimento } = await criarEmpreendimentoDaAna(
      sessaoDe(corretor, imobiliaria),
    );

    await expect(
      salvarBaseDeConhecimento(administrador, {
        empreendimentoId: empreendimento.id,
        texto: base,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      buscarNaBaseDeConhecimento(administrador, {
        empreendimentoId: empreendimento.id,
        pergunta: "x",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      buscarBaseDeConhecimento(administrador, empreendimento.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
