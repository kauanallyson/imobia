import { describe, expect, test } from "bun:test";
import {
  falharTranscricao,
  pedidos,
  roteirizar,
  roteirizarTranscricao,
  transcricoesPedidas,
} from "@/test/fakes/llm";
import {
  downloads,
  enviados,
  mensagemRecebida,
  simularMidia,
} from "@/test/fakes/whatsapp";
import { conectarWhatsappDaAna, criarConcorrente } from "@/test/fixtures";
import { listarMensagens, receberMensagem } from "./conversas";

const telefone = "5588999990000";
const audio = {
  tipo: "audio",
  mimetype: "audio/ogg; codecs=opus",
  nomeDoArquivo: null,
  url: null,
} as const;

describe("transcrição de áudio", () => {
  test("áudio do cliente é baixado, transcrito e o assistente responde ao texto transcrito", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    simularMidia("AUDIO-1", {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/ogg; codecs=opus",
    });
    roteirizarTranscricao("Oi, quero saber se ainda tem lote na quadra A");
    roteirizar({ tipo: "texto", texto: "Tem sim! Posso te mandar o folder?" });

    const result = await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        idMensagem: "AUDIO-1",
        texto: null,
        midia: audio,
      }),
    );

    expect(downloads).toEqual([{ instancia, idMensagem: "AUDIO-1" }]);
    expect(transcricoesPedidas).toEqual([
      { bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/ogg; codecs=opus" },
    ]);
    const mensagens = await listarMensagens(session, result?.conversaId ?? "");
    expect(mensagens.map((m) => [m.autor, m.texto, m.transcricao])).toEqual([
      ["cliente", null, "Oi, quero saber se ainda tem lote na quadra A"],
      ["assistente", "Tem sim! Posso te mandar o folder?", null],
    ]);
    expect(mensagens[0].midia).toEqual(audio);
    // O modelo viu a transcrição como fala do cliente, não uma marcação.
    expect(pedidos[0].historico).toEqual([
      {
        papel: "usuario",
        texto: "Oi, quero saber se ainda tem lote na quadra A",
      },
    ]);
    expect(enviados).toEqual([
      {
        instancia,
        para: telefone,
        tipo: "texto",
        texto: "Tem sim! Posso te mandar o folder?",
      },
    ]);
  });

  test("falha na transcrição guarda o áudio sem transcrição e pede ao cliente que escreva, uma só vez", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    simularMidia("AUDIO-2", {
      bytes: new Uint8Array([9]),
      mimeType: "audio/ogg; codecs=opus",
    });
    falharTranscricao();
    const mensagem = mensagemRecebida({
      instancia,
      telefone,
      idMensagem: "AUDIO-2",
      texto: null,
      midia: audio,
    });

    const result = await receberMensagem(mensagem);
    // Reentrega do webhook: nada muda.
    await receberMensagem(mensagem);

    expect(enviados).toEqual([
      {
        instancia,
        para: telefone,
        tipo: "texto",
        texto: expect.stringContaining("escrever"),
      },
    ]);
    // O modelo não foi chamado: sem transcrição não há o que atender.
    expect(pedidos).toHaveLength(0);
    const mensagens = await listarMensagens(session, result?.conversaId ?? "");
    expect(mensagens.map((m) => [m.autor, m.transcricao])).toEqual([
      ["cliente", null],
      ["assistente", null],
    ]);
    expect(mensagens[1].texto).toContain("escrever");
  });

  test("áudio em instância de outra imobiliária não aparece para a Ana", async () => {
    const { session } = await conectarWhatsappDaAna();
    const concorrente = await criarConcorrente();
    const { gerarQrCode, aceitarRiscoDoWhatsapp, atualizarEstadoDaConexao } =
      await import("./whatsapp");
    const { simularEstado } = await import("@/test/fakes/whatsapp");
    await aceitarRiscoDoWhatsapp(concorrente.session);
    const qr = await gerarQrCode(concorrente.session);
    if (!qr) throw new Error("sem instância");
    simularEstado(qr.instancia, "open");
    await atualizarEstadoDaConexao(qr.instancia, "open");
    simularMidia("AUDIO-3", {
      bytes: new Uint8Array([1]),
      mimeType: "audio/ogg",
    });
    roteirizarTranscricao("Oi Carla");
    roteirizar({ tipo: "texto", texto: "Olá!" });

    const result = await receberMensagem(
      mensagemRecebida({
        instancia: qr.instancia,
        telefone,
        idMensagem: "AUDIO-3",
        texto: null,
        midia: audio,
      }),
    );

    const daConcorrente = await listarMensagens(
      concorrente.session,
      result?.conversaId ?? "",
    );
    expect(daConcorrente[0].transcricao).toBe("Oi Carla");
    expect(await listarMensagens(session, result?.conversaId ?? "")).toEqual(
      [],
    );
  });
});
