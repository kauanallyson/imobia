import { describe, expect, setSystemTime, test } from "bun:test";
import {
  consultasDeHistorico,
  falhas as falhasDoWhatsapp,
  mensagemRecebida,
  simularHistorico,
} from "@/test/fakes/whatsapp";
import {
  administrador,
  conectarWhatsappDaAna,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import { criarCliente, listarClientes } from "./clientes";
import { listarMensagens, receberMensagem } from "./conversas";
import { criarCorretor } from "./corretores";
import { criarImobiliaria } from "./imobiliarias";
import { criarNegocio, historicoDeEtapas, listarNegocios } from "./negocios";

const telefone = "5588999990000";

function conversaDe(result: { conversaId: string } | null) {
  if (!result) throw new Error("mensagem ignorada");
  return result.conversaId;
}

describe("mensagens recebidas", () => {
  test("mensagem de número novo cria cliente, negócio em Novo e guarda a mensagem", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    setSystemTime(new Date("2026-10-23T14:00:00-03:00"));

    const result = await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        nomeDoContato: "Carlos",
        texto: "Oi, vi o anúncio do loteamento",
        enviadaEm: new Date("2026-10-23T13:59:00-03:00"),
      }),
    );

    expect(result?.novoCliente).toBe(true);
    const [cliente] = await listarClientes(session);
    expect(cliente).toMatchObject({ nome: "Carlos", telefone });
    const [negocio] = await listarNegocios(session);
    expect(negocio).toMatchObject({ clienteId: cliente.id, etapa: "novo" });
    expect(await historicoDeEtapas(session, negocio.id)).toEqual([
      {
        de: null,
        para: "novo",
        autor: "sistema",
        em: new Date("2026-10-23T14:00:00-03:00"),
      },
    ]);
    const mensagens = await listarMensagens(session, conversaDe(result));
    expect(mensagens).toEqual([
      expect.objectContaining({
        autor: "cliente",
        texto: "Oi, vi o anúncio do loteamento",
        fromMe: false,
        midia: null,
        transcricao: null,
        enviadaEm: new Date("2026-10-23T13:59:00-03:00"),
      }),
    ]);
  });

  test("número com histórico só recebe a mensagem na conversa, sem novo cliente nem negócio", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    const first = await receberMensagem(
      mensagemRecebida({ instancia, telefone }),
    );

    const second = await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Ainda tem lote?" }),
    );

    expect(second).toMatchObject({
      conversaId: conversaDe(first),
      novoCliente: false,
    });
    expect(await listarClientes(session)).toHaveLength(1);
    expect(await listarNegocios(session)).toHaveLength(1);
    expect(await listarMensagens(session, conversaDe(first))).toHaveLength(2);
  });

  test("mensagens de grupo são ignoradas", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();

    const result = await receberMensagem(
      mensagemRecebida({ instancia, telefone, grupo: true }),
    );

    expect(result).toBeNull();
    expect(await listarClientes(session)).toHaveLength(0);
    expect(await listarNegocios(session)).toHaveLength(0);
  });

  test("fromMe para um número sem histórico não cria cliente (o corretor puxou conversa)", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();

    const result = await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        fromMe: true,
        texto: "Oi, tudo bem?",
      }),
    );

    expect(result).toBeNull();
    expect(await listarClientes(session)).toHaveLength(0);
  });

  test("número com conversa anterior no WhatsApp (antes do loteAI) não vira cliente", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    simularHistorico(telefone);

    for (const texto of ["Oi, filho", "Tudo bem?"]) {
      expect(
        await receberMensagem(mensagemRecebida({ instancia, telefone, texto })),
      ).toBeNull();
    }

    expect(await listarClientes(session)).toHaveLength(0);
    expect(await listarNegocios(session)).toHaveLength(0);
    // Conhecido: a Evolution só é consultada na primeira mensagem.
    expect(consultasDeHistorico).toHaveLength(1);
  });

  test("a resposta a uma conversa puxada pelo corretor não vira cliente", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, fromMe: true, texto: "Oi!" }),
    );

    expect(
      await receberMensagem(
        mensagemRecebida({ instancia, telefone, texto: "Oi, tudo bem?" }),
      ),
    ).toBeNull();
    expect(await listarClientes(session)).toHaveLength(0);
  });

  test("sem resposta da Evolution sobre o histórico, nada é gravado e a próxima mensagem consulta de novo", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    falhasDoWhatsapp.historico = true;
    expect(
      await receberMensagem(mensagemRecebida({ instancia, telefone })),
    ).toBeNull();
    expect(await listarClientes(session)).toHaveLength(0);

    falhasDoWhatsapp.historico = false;
    conversaDe(
      await receberMensagem(mensagemRecebida({ instancia, telefone })),
    );
    expect(await listarClientes(session)).toHaveLength(1);
  });

  describe("cliente cadastrado à mão (sem conversa)", () => {
    async function clienteDaAna() {
      const conectado = await conectarWhatsappDaAna();
      const cliente = await criarCliente(conectado.session, {
        nome: "Carlos Lima",
        telefone,
      });
      const negocio = ok(
        await criarNegocio(conectado.session, { clienteId: cliente.id }),
      );
      return { ...conectado, cliente, negocio };
    }

    test("a mensagem dele abre a conversa no mesmo cliente, sem duplicar cliente nem negócio", async () => {
      const { session, instancia, cliente } = await clienteDaAna();

      const result = await receberMensagem(
        mensagemRecebida({ instancia, telefone, texto: "Oi, Ana" }),
      );

      expect(result?.novoCliente).toBe(false);
      expect((await listarClientes(session)).map((c) => c.id)).toEqual([
        cliente.id,
      ]);
      expect(await listarNegocios(session)).toHaveLength(1);
      expect(
        (await listarMensagens(session, conversaDe(result))).map(
          (m) => m.texto,
        ),
      ).toContain("Oi, Ana");
    });

    test("sem negócio, a mensagem dele abre um negócio em Novo", async () => {
      const { session, instancia } = await conectarWhatsappDaAna();
      await criarCliente(session, { nome: "Carlos Lima", telefone });

      conversaDe(
        await receberMensagem(mensagemRecebida({ instancia, telefone })),
      );

      expect(await listarClientes(session)).toHaveLength(1);
      expect(await listarNegocios(session)).toMatchObject([{ etapa: "novo" }]);
    });

    test("histórico anterior na Evolution não o torna contato ignorado", async () => {
      const { session, instancia } = await clienteDaAna();
      simularHistorico(telefone);

      conversaDe(
        await receberMensagem(mensagemRecebida({ instancia, telefone })),
      );
      expect(consultasDeHistorico).toEqual([]);
      expect(await listarClientes(session)).toHaveLength(1);
    });

    test("mensagem fromMe do corretor para ele fica na conversa e a resposta também", async () => {
      const { session, instancia } = await clienteDaAna();

      const doCorretor = await receberMensagem(
        mensagemRecebida({ instancia, telefone, fromMe: true, texto: "Oi!" }),
      );
      const resposta = await receberMensagem(
        mensagemRecebida({ instancia, telefone, texto: "Oi, tudo bem?" }),
      );

      expect(conversaDe(resposta)).toBe(conversaDe(doCorretor));
      expect(
        (await listarMensagens(session, conversaDe(resposta))).map((m) => [
          m.autor,
          m.texto,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ["corretor", "Oi!"],
          ["cliente", "Oi, tudo bem?"],
        ]),
      );
      expect(await listarClientes(session)).toHaveLength(1);
    });
  });

  test("fromMe numa conversa existente é guardada com autor corretor", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    setSystemTime(new Date("2026-10-23T14:00:00-03:00"));
    const first = await receberMensagem(
      mensagemRecebida({ instancia, telefone }),
    );
    setSystemTime(new Date("2026-10-23T15:00:00-03:00"));

    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        fromMe: true,
        texto: "Oi Carlos, aqui é a Ana",
        enviadaEm: new Date("2026-10-23T15:00:00-03:00"),
      }),
    );

    const mensagens = await listarMensagens(session, conversaDe(first));
    expect(mensagens[1]).toMatchObject({
      autor: "corretor",
      fromMe: true,
      texto: "Oi Carlos, aqui é a Ana",
    });
    expect(await listarNegocios(session)).toHaveLength(1);
  });

  test("webhook reentregue com a mesma mensagem não duplica mensagem, cliente nem negócio", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    const mensagem = mensagemRecebida({
      instancia,
      telefone,
      idMensagem: "3EB0ABC",
    });

    const first = await receberMensagem(mensagem);
    const again = await receberMensagem(mensagem);
    const [c1, c2] = await Promise.all([
      receberMensagem(
        mensagemRecebida({
          instancia,
          telefone: "5588911112222",
          idMensagem: "X1",
        }),
      ),
      receberMensagem(
        mensagemRecebida({
          instancia,
          telefone: "5588911112222",
          idMensagem: "X1",
        }),
      ),
    ]);

    expect(again?.conversaId).toBe(conversaDe(first));
    expect(c2?.conversaId).toBe(conversaDe(c1));
    expect(await listarClientes(session)).toHaveLength(2);
    expect(await listarNegocios(session)).toHaveLength(2);
    expect(await listarMensagens(session, conversaDe(first))).toHaveLength(1);
    expect(await listarMensagens(session, conversaDe(c1))).toHaveLength(1);
  });

  test("mensagem com mídia guarda a mídia e a transcrição vazia", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();

    const result = await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        texto: null,
        midia: {
          tipo: "audio",
          mimetype: "audio/ogg; codecs=opus",
          nomeDoArquivo: null,
          url: null,
        },
      }),
    );

    const [mensagem] = await listarMensagens(session, conversaDe(result));
    expect(mensagem).toMatchObject({
      texto: null,
      midia: { tipo: "audio", mimetype: "audio/ogg; codecs=opus" },
      transcricao: null,
    });
  });

  test("mensagem para instância desconhecida ou sem telefone é ignorada", async () => {
    const { instancia } = await conectarWhatsappDaAna();

    expect(
      await receberMensagem(mensagemRecebida({ instancia: "outra", telefone })),
    ).toBeNull();
    expect(
      await receberMensagem({
        ...mensagemRecebida({ instancia, telefone }),
        telefone: null,
      }),
    ).toBeNull();
  });

  test("clientes, negócios e conversas são só do corretor dono", async () => {
    const { imobiliaria, instancia } = await conectarWhatsappDaAna();
    const result = await receberMensagem(
      mensagemRecebida({ instancia, telefone }),
    );
    const outro = sessaoDe({ id: crypto.randomUUID() }, imobiliaria);
    const outraImobiliaria = await criarImobiliaria(administrador, {
      nome: "Concorrente",
    });
    const corretor = await criarCorretor(administrador, {
      imobiliariaId: outraImobiliaria.id,
      nome: "Bruno",
      email: "bruno@concorrente.com.br",
      senha: "senha-forte-123",
    });
    const bruno = sessaoDe(corretor ?? { id: "" }, outraImobiliaria);

    expect(await listarClientes(outro)).toEqual([]);
    expect(await listarNegocios(outro)).toEqual([]);
    expect(await listarMensagens(outro, conversaDe(result))).toEqual([]);
    expect(await listarClientes(bruno)).toEqual([]);
    expect(await listarMensagens(bruno, "nao-e-uuid")).toEqual([]);
  });
});
