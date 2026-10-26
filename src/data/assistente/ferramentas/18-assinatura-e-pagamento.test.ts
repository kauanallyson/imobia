import { describe, expect, setSystemTime, test } from "bun:test";
import { pedidos, roteirizar } from "@/test/fakes/llm";
import { mensagemRecebida, simularMidia } from "@/test/fakes/whatsapp";
import { criarCenarioDeAssinaturaDaAna, ok } from "@/test/fixtures";
import {
  buscarFechamento,
  confirmarAssinatura,
} from "../../assinatura-e-pagamento";
import { receberMensagem } from "../../conversas";
import { listarPendencias } from "../../pendencias";

const segunda9h = new Date("2026-11-02T09:00:00-03:00");
const telefone = "5588999990000";

const resultado = () => pedidos[1]?.respostaAnterior?.resultados[0]?.resultado;

async function clienteMandaComFerramenta(
  instancia: string,
  ferramenta: string,
  arquivo: { id: string; tipo: "imagem" | "documento"; mimetype: string },
) {
  simularMidia(arquivo.id, {
    bytes: new Uint8Array([1]),
    mimeType: arquivo.mimetype,
  });
  pedidos.length = 0;
  roteirizar(
    { tipo: "chamadas", chamadas: [{ nome: ferramenta, argumentos: {} }] },
    { tipo: "texto", texto: "Recebi! A Ana vai conferir." },
  );
  await receberMensagem(
    mensagemRecebida({
      instancia,
      telefone,
      idMensagem: arquivo.id,
      texto: null,
      midia: {
        tipo: arquivo.tipo,
        mimetype: arquivo.mimetype,
        nomeDoArquivo: arquivo.tipo === "documento" ? "arquivo.pdf" : null,
        url: null,
      },
    }),
  );
}

describe("assistente: assinatura e pagamento", () => {
  test("registrar_proposta_assinada anexa o PDF e chama o corretor", async () => {
    setSystemTime(segunda9h);
    const { instancia, session, negocio } =
      await criarCenarioDeAssinaturaDaAna();
    await clienteMandaComFerramenta(instancia, "registrar_proposta_assinada", {
      id: "PDF-ASSINADO",
      tipo: "documento",
      mimetype: "application/pdf",
    });
    expect(resultado()).toMatchObject({ registrado: true });
    expect(
      ok(await buscarFechamento(session, negocio.id)).propostaAssinada,
    ).not.toBeNull();
    expect((await listarPendencias(session))[0]?.tipo).toBe(
      "confirmar_assinatura",
    );
  });

  test("registrar_comprovante_de_pagamento cria a pendência de pagamento", async () => {
    setSystemTime(segunda9h);
    const { instancia, session, negocio } =
      await criarCenarioDeAssinaturaDaAna();
    await clienteMandaComFerramenta(instancia, "registrar_proposta_assinada", {
      id: "PDF-ASSINADO",
      tipo: "documento",
      mimetype: "application/pdf",
    });
    ok(await confirmarAssinatura(session, negocio.id));
    await clienteMandaComFerramenta(
      instancia,
      "registrar_comprovante_de_pagamento",
      { id: "COMPROVANTE", tipo: "imagem", mimetype: "image/png" },
    );
    expect(resultado()).toMatchObject({ registrado: true });
    expect(
      ok(await buscarFechamento(session, negocio.id)).comprovantes,
    ).toHaveLength(1);
    expect(
      (await listarPendencias(session)).some(
        (p) => p.tipo === "confirmar_pagamento" && p.estado === "aberta",
      ),
    ).toBe(true);
  });

  test("comprovante fora de Aguardando pagamento volta como erro para o modelo", async () => {
    setSystemTime(segunda9h);
    const { instancia } = await criarCenarioDeAssinaturaDaAna();
    await clienteMandaComFerramenta(
      instancia,
      "registrar_comprovante_de_pagamento",
      { id: "COMPROVANTE", tipo: "imagem", mimetype: "image/png" },
    );
    expect(resultado()).toMatchObject({ erro: expect.any(String) });
  });
});
