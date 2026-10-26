import { describe, expect, setSystemTime, test } from "bun:test";
import { gerados } from "@/test/fakes/documentos";
import { pedidos, roteirizar } from "@/test/fakes/llm";
import { mensagemRecebida } from "@/test/fakes/whatsapp";
import {
  criarCenarioDeColetaDaAna,
  criarCenarioDePropostaDaAna,
  ok,
} from "@/test/fixtures";
import { receberMensagem } from "../../conversas";
import { buscarNegocio } from "../../negocios";
import { listarPendencias } from "../../pendencias";

const segunda9h = new Date("2026-11-02T09:00:00-03:00");
const telefone = "5588999990000";

const resultado = () => pedidos[1]?.respostaAnterior?.resultados[0]?.resultado;

function pedirProposta() {
  roteirizar(
    {
      tipo: "chamadas",
      chamadas: [{ nome: "solicitar_proposta", argumentos: {} }],
    },
    { tipo: "texto", texto: "Pronto! A Ana vai revisar a proposta." },
  );
}

describe("assistente: solicitar_proposta", () => {
  test("com a coleta completa gera a proposta e cria a pendência", async () => {
    setSystemTime(segunda9h);
    const { instancia, session, negocio } = await criarCenarioDePropostaDaAna();
    pedirProposta();
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Mandei tudo" }),
    );
    expect(resultado()).toMatchObject({ estado: "em_revisao" });
    expect(gerados).toHaveLength(1);
    const detalhe = ok(await buscarNegocio(session, negocio.id));
    expect(detalhe.etapa).toBe("proposta_em_revisao");
    expect(
      detalhe.historico.find((h) => h.para === "proposta_em_revisao")?.autor,
    ).toBe("assistente");
    expect((await listarPendencias(session))[0]?.tipo).toBe("revisar_proposta");
  });

  test("com a coleta incompleta devolve o que falta", async () => {
    setSystemTime(segunda9h);
    const { instancia } = await criarCenarioDeColetaDaAna();
    pedirProposta();
    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        texto: "Pode fazer a proposta?",
      }),
    );
    expect(resultado()).toMatchObject({
      erro: expect.any(String),
      faltando: expect.arrayContaining([
        expect.objectContaining({ item: "email" }),
      ]),
    });
    expect(gerados).toHaveLength(0);
  });
});
