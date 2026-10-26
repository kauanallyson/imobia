import { describe, expect, setSystemTime, test } from "bun:test";
import { pedidos, roteirizar } from "@/test/fakes/llm";
import {
  aoEnviarEcoar,
  enviados,
  mensagemRecebida,
} from "@/test/fakes/whatsapp";
import {
  criarConcorrente,
  criarEmpreendimentoDaAna,
  iniciarConversaDaAna,
  ok,
} from "@/test/fixtures";
import {
  enviarMidiaAoCliente,
  enviarTextoAoCliente,
  OptOutError,
} from "./assistente/contexto";
import {
  buscarConversa,
  desligarAssistente,
  devolverAoAssistente,
  ligarAssistente,
  listarMensagens,
  receberMensagem,
  registrarOptOut,
  retomarAssistentesPausados,
} from "./conversas";
import { enviarMaterialDeMarketing } from "./materiais-de-marketing";
import { historicoDeEtapas, listarNegocios } from "./negocios";
import { ForbiddenError, type Session } from "./session";

const T0 = new Date("2026-10-23T14:00:00-03:00");
const horas = (n: number) => new Date(T0.getTime() + n * 60 * 60 * 1000);

describe("pausa pelo corretor", () => {
  test("mensagem fromMe do corretor pausa o assistente; as seguintes do cliente ficam sem resposta", async () => {
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    setSystemTime(horas(1));

    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        fromMe: true,
        texto: "Oi Carlos, aqui é a Ana",
        enviadaEm: horas(1),
      }),
    );
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Oi Ana!" }),
    );

    expect(ok(await buscarConversa(session, conversaId))).toMatchObject({
      assistente: "pausado",
      ultimaMensagemCorretorEm: horas(1),
      optOut: false,
    });
    expect(enviados).toEqual([]);
    expect(pedidos).toEqual([]);
  });

  test("o eco da própria mensagem do assistente (fromMe) não o pausa", async () => {
    const { session, instancia, telefone, conversaId, idDaResposta } =
      await iniciarConversaDaAna();

    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        fromMe: true,
        idMensagem: idDaResposta,
        texto: "Olá! Sou a assistente virtual da Ana Souza.",
      }),
    );

    expect(ok(await buscarConversa(session, conversaId))).toMatchObject({
      assistente: "ativo",
      ultimaMensagemCorretorEm: null,
    });
  });

  test("o eco que chega antes de o envio do assistente ser gravado também é do assistente", async () => {
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    aoEnviarEcoar(receberMensagem);
    roteirizar({ tipo: "texto", texto: "Temos lotes a partir de R$ 60 mil." });

    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Quais os preços?" }),
    );

    expect(ok(await buscarConversa(session, conversaId))).toMatchObject({
      assistente: "ativo",
      ultimaMensagemCorretorEm: null,
    });
    const lista = await listarMensagens(session, conversaId);
    expect(lista.filter((m) => m.autor === "corretor")).toEqual([]);
    const doAssistente = lista.filter((m) => m.autor === "assistente");
    expect(doAssistente.map((m) => m.texto)).toEqual([
      "Olá! Sou a assistente virtual da Ana Souza.",
      "Temos lotes a partir de R$ 60 mil.",
    ]);
    expect(doAssistente.every((m) => m.evolutionId)).toBe(true);
  });

  test("mensagem do corretor com o mesmo texto de um envio antigo do assistente ainda pausa", async () => {
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        fromMe: true,
        texto: "Olá! Sou a assistente virtual da Ana Souza.",
      }),
    );
    expect(ok(await buscarConversa(session, conversaId)).assistente).toBe(
      "pausado",
    );
  });

  test("devolver ao assistente reativa a conversa e o cliente volta a ser respondido", async () => {
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, fromMe: true, texto: "Oi" }),
    );
    roteirizar({ tipo: "texto", texto: "Posso ajudar em algo mais?" });

    const devolvida = await devolverAoAssistente(session, conversaId);
    const deNovo = await devolverAoAssistente(session, conversaId);
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Tenho uma dúvida" }),
    );

    expect(devolvida?.assistente).toBe("ativo");
    expect(deNovo).toEqual(devolvida);
    expect(enviados.map((e) => e.tipo === "texto" && e.texto)).toEqual([
      "Posso ajudar em algo mais?",
    ]);
  });

  test("após 24h sem mensagem do corretor o worker retoma o assistente", async () => {
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    setSystemTime(T0);
    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        fromMe: true,
        texto: "Oi",
        enviadaEm: T0,
      }),
    );

    setSystemTime(horas(23));
    expect(await retomarAssistentesPausados()).toBe(0);
    expect(ok(await buscarConversa(session, conversaId)).assistente).toBe(
      "pausado",
    );

    setSystemTime(horas(25));
    expect(await retomarAssistentesPausados()).toBe(1);
    expect(ok(await buscarConversa(session, conversaId)).assistente).toBe(
      "ativo",
    );
    expect(await retomarAssistentesPausados()).toBe(0);
  });

  test("pausado por chamar_corretor retoma 24h depois da pausa ou da última mensagem do corretor, a mais recente", async () => {
    setSystemTime(T0);
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    // O corretor falou há dois dias; depois o assistente voltou.
    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        fromMe: true,
        texto: "Oi, aqui é a Ana",
        enviadaEm: T0,
      }),
    );
    await devolverAoAssistente(session, conversaId);

    setSystemTime(horas(48));
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          { nome: "chamar_corretor", argumentos: { motivo: "Quer a Ana" } },
        ],
      },
      { tipo: "texto", texto: "Vou chamar a Ana." },
    );
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Quero falar com a Ana" }),
    );
    expect(ok(await buscarConversa(session, conversaId)).assistente).toBe(
      "pausado",
    );

    // 1h depois da pausa: a mensagem antiga do corretor não conta.
    setSystemTime(horas(49));
    expect(await retomarAssistentesPausados()).toBe(0);

    // O corretor responde 10h depois da pausa: conta a partir dela.
    setSystemTime(horas(58));
    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        fromMe: true,
        texto: "Oi, tudo bem?",
        enviadaEm: horas(58),
      }),
    );
    setSystemTime(horas(73));
    expect(await retomarAssistentesPausados()).toBe(0);
    setSystemTime(horas(83));
    expect(await retomarAssistentesPausados()).toBe(1);
    expect(ok(await buscarConversa(session, conversaId)).assistente).toBe(
      "ativo",
    );
  });

  test("pausado por chamar_corretor sem nenhuma mensagem do corretor retoma 24h depois", async () => {
    setSystemTime(T0);
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          { nome: "chamar_corretor", argumentos: { motivo: "Quer a Ana" } },
        ],
      },
      { tipo: "texto", texto: "Vou chamar a Ana." },
    );
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Quero falar com a Ana" }),
    );

    setSystemTime(horas(23));
    expect(await retomarAssistentesPausados()).toBe(0);
    setSystemTime(horas(25));
    expect(await retomarAssistentesPausados()).toBe(1);
    expect(ok(await buscarConversa(session, conversaId)).assistente).toBe(
      "ativo",
    );
  });

  test("ligar/desligar por conversa; desligado não retoma sozinho nem com fromMe", async () => {
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    setSystemTime(T0);

    const desligada = await desligarAssistente(session, conversaId);
    expect(desligada?.assistente).toBe("desligado");
    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        fromMe: true,
        texto: "Oi",
        enviadaEm: T0,
      }),
    );
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Alguém?" }),
    );
    setSystemTime(horas(48));
    expect(await retomarAssistentesPausados()).toBe(0);
    expect(ok(await buscarConversa(session, conversaId)).assistente).toBe(
      "desligado",
    );
    expect(enviados).toEqual([]);

    const ligada = await ligarAssistente(session, conversaId);
    expect(ligada?.assistente).toBe("ativo");
    expect(await ligarAssistente(session, conversaId)).toEqual(ligada);
  });

  test("conversa de outro corretor não aparece", async () => {
    const { conversaId } = await iniciarConversaDaAna();
    const { session: outra } = await criarConcorrente();
    expect(await buscarConversa(outra, conversaId)).toBeNull();
    expect(await devolverAoAssistente(outra, conversaId)).toBeNull();
    expect(await desligarAssistente(outra, conversaId)).toBeNull();
    expect(await buscarConversa(outra, "nao-uuid")).toBeNull();
    await expect(
      buscarConversa({ role: "administrador" }, conversaId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("opt-out do cliente", () => {
  test("cliente sem interesse: a ferramenta desliga a conversa em definitivo, perde o negócio e só a despedida sai", async () => {
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    ok(
      await enviarMaterialDeMarketing(session, {
        empreendimentoId: empreendimento.id,
        nome: "Folder",
        tipoDeArquivo: "pdf",
        destino: "lote",
        contentType: "application/pdf",
        conteudo: new TextEncoder().encode("%PDF-1.4"),
      }),
    );
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          { nome: "registrar_opt_out", argumentos: {} },
          {
            nome: "enviar_material_de_marketing",
            argumentos: { destino: "lote" },
          },
        ],
      },
      { tipo: "texto", texto: "Tudo bem, obrigada! Até mais." },
    );

    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        texto: "Não tenho interesse, não me mande mais nada",
      }),
    );

    expect(enviados).toEqual([
      {
        instancia,
        para: telefone,
        tipo: "texto",
        texto: "Tudo bem, obrigada! Até mais.",
      },
    ]);
    expect(pedidos[1]?.respostaAnterior?.resultados[1]?.resultado).toEqual({
      erro: expect.any(String),
    });
    expect(ok(await buscarConversa(session, conversaId))).toMatchObject({
      assistente: "desligado",
      optOut: true,
    });
    const [negocio] = await listarNegocios(session);
    expect(negocio).toMatchObject({
      etapa: "perdido",
      motivoPerda: "sem interesse",
    });
    expect((await historicoDeEtapas(session, negocio.id)).at(-1)).toMatchObject(
      { para: "perdido", autor: "assistente" },
    );

    // Depois: nada mais sai, e nem o corretor religa o assistente.
    enviados.length = 0;
    roteirizar({ tipo: "texto", texto: "não deveria ser enviado" });
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Pensando melhor..." }),
    );
    expect(await devolverAoAssistente(session, conversaId)).toMatchObject({
      assistente: "desligado",
      optOut: true,
    });
    expect(await ligarAssistente(session, conversaId)).toMatchObject({
      assistente: "desligado",
    });
    expect(enviados).toEqual([]);
  });

  test("os envios ao cliente recusam quando a conversa tem opt-out", async () => {
    const { session, instancia, telefone, conversaId } =
      await iniciarConversaDaAna();
    ok(await registrarOptOut(session, conversaId));
    const contexto = {
      session: session as Extract<Session, { role: "corretor" }>,
      instancia,
      corretor: { nome: "Ana" },
      conversa: { id: conversaId, telefone },
      negocio: {
        id: crypto.randomUUID(),
        etapa: "novo" as const,
        interesse: null,
        empreendimentoInteresseId: null,
        loteInteresseId: null,
      },
    };

    await expect(enviarTextoAoCliente(contexto, "oi")).rejects.toBeInstanceOf(
      OptOutError,
    );
    await expect(
      enviarMidiaAoCliente(contexto, {
        tipo: "document",
        url: "fake://x",
        mimetype: "application/pdf",
        legenda: "x",
        nomeDoArquivo: "x.pdf",
      }),
    ).rejects.toBeInstanceOf(OptOutError);
    expect(enviados).toEqual([]);
  });

  test("as instruções mandam chamar registrar_opt_out quando o cliente não tem interesse", async () => {
    const { instancia, telefone } = await iniciarConversaDaAna();
    roteirizar({ tipo: "texto", texto: "Ok" });
    await receberMensagem(mensagemRecebida({ instancia, telefone }));
    expect(pedidos[0]?.instrucoes).toContain("registrar_opt_out");
    expect(pedidos[0]?.ferramentas.map((f) => f.nome)).toContain(
      "registrar_opt_out",
    );
  });
});
