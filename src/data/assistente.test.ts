import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversas } from "@/lib/db/schema";
import { embeddingsPedidos, pedidos, roteirizar } from "@/test/fakes/llm";
import { enviados, mensagemRecebida } from "@/test/fakes/whatsapp";
import {
  conectarWhatsappDaAna,
  criarConcorrente,
  criarEmpreendimentoDaAna,
  ok,
} from "@/test/fixtures";
import { salvarBaseDeConhecimento } from "./base-de-conhecimento";
import { listarMensagens, receberMensagem } from "./conversas";
import { enviarMaterialDeMarketing } from "./materiais-de-marketing";
import { historicoDeEtapas, listarNegocios } from "./negocios";
import type { Session } from "./session";

const telefone = "5588999990000";

async function materiais(session: Session, empreendimentoId: string) {
  const pdf = new TextEncoder().encode("%PDF-1.4");
  const folderLote = ok(
    await enviarMaterialDeMarketing(session, {
      empreendimentoId,
      nome: "Folder dos lotes",
      tipoDeArquivo: "pdf",
      destino: "lote",
      contentType: "application/pdf",
      conteudo: pdf,
    }),
  );
  const videoCasa = ok(
    await enviarMaterialDeMarketing(session, {
      empreendimentoId,
      nome: "Tour da casa modelo",
      tipoDeArquivo: "video",
      destino: "lote_e_casa",
      contentType: "video/mp4",
      conteudo: pdf,
    }),
  );
  return { folderLote, videoCasa };
}

describe("assistente: primeiro atendimento", () => {
  test("mensagem de número novo recebe a resposta do assistente e o negócio vai para Em atendimento", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    roteirizar({
      tipo: "texto",
      texto:
        "Olá! Sou a assistente virtual da Ana Souza. Você procura lote ou lote + casa?",
    });

    const result = await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Oi, vi o anúncio" }),
    );

    expect(enviados).toEqual([
      {
        instancia,
        para: telefone,
        tipo: "texto",
        texto:
          "Olá! Sou a assistente virtual da Ana Souza. Você procura lote ou lote + casa?",
      },
    ]);
    const mensagens = await listarMensagens(session, result?.conversaId ?? "");
    expect(mensagens.map((m) => [m.autor, m.texto])).toEqual([
      ["cliente", "Oi, vi o anúncio"],
      [
        "assistente",
        "Olá! Sou a assistente virtual da Ana Souza. Você procura lote ou lote + casa?",
      ],
    ]);
    const [negocio] = await listarNegocios(session);
    expect(negocio.etapa).toBe("em_atendimento");
    const historico = await historicoDeEtapas(session, negocio.id);
    expect(historico.map((h) => [h.para, h.autor])).toEqual([
      ["novo", "sistema"],
      ["em_atendimento", "assistente"],
    ]);
  });

  test("cliente que quer lote + casa recebe o material de lote + casa pela ferramenta", async () => {
    const { session, instancia, imobiliaria } = await conectarWhatsappDaAna();
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const { videoCasa } = await materiais(session, empreendimento.id);
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "registrar_interesse",
            argumentos: { interesse: "lote_e_casa" },
          },
          {
            nome: "enviar_material_de_marketing",
            argumentos: { destino: "lote_e_casa" },
          },
        ],
      },
      { tipo: "texto", texto: "Acabei de te mandar o tour da casa modelo!" },
    );

    const result = await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Quero lote + casa" }),
    );

    expect(enviados).toEqual([
      {
        instancia,
        para: telefone,
        tipo: "midia",
        url: expect.stringContaining(
          `fake://imobiliarias/${imobiliaria.id}/empreendimentos/${empreendimento.id}/materiais/${videoCasa.id}?exp=`,
        ),
      },
      {
        instancia,
        para: telefone,
        tipo: "texto",
        texto: "Acabei de te mandar o tour da casa modelo!",
      },
    ]);
    const [negocio] = await listarNegocios(session);
    expect(negocio).toMatchObject({
      interesse: "lote_e_casa",
      empreendimentoInteresseId: empreendimento.id,
      etapa: "em_atendimento",
    });
    // O modelo recebeu o resultado das duas ferramentas encadeado à resposta.
    expect(
      pedidos[1]?.respostaAnterior?.resultados.map((r) => r.resultado),
    ).toEqual([
      { interesse: "lote_e_casa", empreendimentoId: empreendimento.id },
      {
        empreendimento: "Jardim das Flores",
        enviados: ["Tour da casa modelo"],
      },
    ]);
    const mensagens = await listarMensagens(session, result?.conversaId ?? "");
    expect(
      mensagens.map((m) => [m.autor, m.texto, m.midia?.tipo ?? null]),
    ).toEqual([
      ["cliente", "Quero lote + casa", null],
      ["assistente", "Tour da casa modelo", "video"],
      ["assistente", "Acabei de te mandar o tour da casa modelo!", null],
    ]);
  });

  test("dúvida do cliente passa pela busca na base de conhecimento", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    await salvarBaseDeConhecimento(session, {
      empreendimentoId: empreendimento.id,
      texto:
        "O loteamento fica a 5 minutos do centro de Sobral.\n\nTem energia e água encanada em todos os lotes.",
    });
    embeddingsPedidos.length = 0;
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "buscar_base_de_conhecimento",
            argumentos: {
              pergunta: "O loteamento fica perto do centro de Sobral?",
            },
          },
        ],
      },
      { tipo: "texto", texto: "Fica a 5 minutos do centro de Sobral." },
    );

    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Fica perto do centro?" }),
    );

    expect(embeddingsPedidos).toEqual([
      ["O loteamento fica perto do centro de Sobral?"],
    ]);
    expect(pedidos[1]?.respostaAnterior?.resultados[0]?.resultado).toEqual({
      empreendimento: "Jardim das Flores",
      trechos: [
        "O loteamento fica a 5 minutos do centro de Sobral.\n\nTem energia e água encanada em todos os lotes.",
      ],
    });
    expect(enviados).toEqual([
      {
        instancia,
        para: telefone,
        tipo: "texto",
        texto: "Fica a 5 minutos do centro de Sobral.",
      },
    ]);
  });

  test("as instruções apresentam o assistente como assistente virtual do corretor e oferecem as ferramentas", async () => {
    const { instancia } = await conectarWhatsappDaAna();
    roteirizar({ tipo: "texto", texto: "Olá!" });

    await receberMensagem(mensagemRecebida({ instancia, telefone }));

    expect(pedidos[0]?.instrucoes).toContain(
      '"assistente virtual do(a) Ana Souza"',
    );
    expect(pedidos[0]?.instrucoes).toContain("inteligência artificial");
    expect(pedidos[0]?.historico).toEqual([{ papel: "usuario", texto: "Olá" }]);
    expect(pedidos[0]?.ferramentas.map((f) => f.nome)).toEqual([
      "listar_empreendimentos",
      "buscar_base_de_conhecimento",
      "enviar_material_de_marketing",
      "registrar_interesse",
      "mudar_etapa",
      // ticket 13
      "listar_horarios_livres",
      "agendar_visita",
      "remarcar_visita",
      "fechar_agora",
      "registrar_opt_out",
      "criar_pendencia_pergunta_sem_resposta",
      "chamar_corretor",
      // ticket 12
      "registrar_orcamento",
      "listar_opcoes_no_orcamento",
      "escolher_plano",
      "pedido_de_desconto",
      // ticket 16
      "iniciar_coleta",
      "registrar_dados_do_cliente",
      "registrar_referencia",
      "registrar_pagamento",
      "registrar_documento",
      "escolher_lote",
      "status_da_coleta",
      "solicitar_proposta",
    ]);
  });

  test.each([
    "pausado",
    "desligado",
  ] as const)("conversa com assistente %s não recebe resposta", async (estado) => {
    const { session, instancia } = await conectarWhatsappDaAna();
    roteirizar({ tipo: "texto", texto: "Olá!" });
    const first = await receberMensagem(
      mensagemRecebida({ instancia, telefone }),
    );
    enviados.length = 0;
    // O controle do estado pela interface vem no ticket de pausa (10).
    await db
      .update(conversas)
      .set({ assistente: estado })
      .where(eq(conversas.id, first?.conversaId ?? ""));

    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Alguém aí?" }),
    );

    expect(enviados).toEqual([]);
    expect(
      await listarMensagens(session, first?.conversaId ?? ""),
    ).toHaveLength(3);
    expect(pedidos).toHaveLength(1);
  });

  test("a mesma mensagem entregue duas vezes gera uma única resposta", async () => {
    const { instancia } = await conectarWhatsappDaAna();
    roteirizar(
      { tipo: "texto", texto: "Olá!" },
      { tipo: "texto", texto: "De novo?" },
    );
    const mensagem = mensagemRecebida({
      instancia,
      telefone,
      idMensagem: "EVO-1",
    });

    await receberMensagem(mensagem);
    await receberMensagem(mensagem);

    expect(enviados).toHaveLength(1);
    expect(pedidos).toHaveLength(1);
  });

  test("falha do modelo não derruba o recebimento: a mensagem fica guardada", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    // Sem roteiro, o falso lança erro como a API faria.
    const result = await receberMensagem(
      mensagemRecebida({ instancia, telefone }),
    );

    expect(result?.gravada).toBe(true);
    expect(
      await listarMensagens(session, result?.conversaId ?? ""),
    ).toHaveLength(1);
    expect(enviados).toEqual([]);
    const [negocio] = await listarNegocios(session);
    expect(negocio.etapa).toBe("novo");
  });

  test("ferramentas não alcançam o empreendimento de outra imobiliária", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    const concorrente = await criarConcorrente();
    const { empreendimento: alheio } = await criarEmpreendimentoDaAna(
      concorrente.session,
    );
    await materiais(concorrente.session, alheio.id);
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "enviar_material_de_marketing",
            argumentos: { destino: "lote", empreendimentoId: alheio.id },
          },
          { nome: "listar_empreendimentos", argumentos: {} },
        ],
      },
      { tipo: "texto", texto: "Vou verificar com a Ana." },
    );

    await receberMensagem(mensagemRecebida({ instancia, telefone }));

    const resultados = pedidos[1]?.respostaAnterior?.resultados.map(
      (r) => r.resultado,
    );
    expect(resultados?.[0]).toEqual({ erro: expect.any(String) });
    expect(resultados?.[1]).toEqual([]);
    expect(enviados.filter((e) => e.tipo === "midia")).toEqual([]);
    const [negocio] = await listarNegocios(session);
    expect(negocio.empreendimentoInteresseId).toBeNull();
  });

  test("argumentos inválidos voltam como erro para o modelo, sem derrubar o atendimento", async () => {
    const { instancia } = await conectarWhatsappDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "registrar_interesse",
            argumentos: { interesse: "cobertura" },
          },
          { nome: "ferramenta_inexistente", argumentos: {} },
        ],
      },
      { tipo: "texto", texto: "Você procura lote ou lote + casa?" },
    );

    await receberMensagem(mensagemRecebida({ instancia, telefone }));

    const resultados = pedidos[1]?.respostaAnterior?.resultados.map(
      (r) => r.resultado,
    );
    expect(resultados).toEqual([
      { erro: expect.stringContaining("Argumentos inválidos") },
      { erro: "Ferramenta desconhecida: ferramenta_inexistente" },
    ]);
    expect(enviados).toHaveLength(1);
  });
});
