import { describe, expect, setSystemTime, test } from "bun:test";
import { arquivos } from "@/test/fakes/storage";
import {
  criarAna,
  criarBruno,
  criarConcorrente,
  criarEmpreendimentoDaAna,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import {
  type DestinoDoMaterial,
  enviarMaterialDeMarketing,
  listarMateriaisDeMarketing,
  materiaisPara,
  removerMaterialDeMarketing,
  urlDoMaterial,
} from "./materiais-de-marketing";
import { ForbiddenError } from "./session";

const pdf = new TextEncoder().encode("%PDF-1.4 folder");

const folder = {
  nome: "Folder do loteamento",
  tipoDeArquivo: "pdf" as const,
  destino: "lote" as const,
  contentType: "application/pdf",
  conteudo: pdf,
};

describe("materiais de marketing", () => {
  test("corretor envia um material; ele vai para o storage e outro corretor da imobiliária o vê", async () => {
    setSystemTime(new Date("2026-10-23T10:00:00-03:00"));
    const { imobiliaria, corretor } = await criarAna();
    const bruno = await criarBruno(imobiliaria);
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);

    const material = ok(
      await enviarMaterialDeMarketing(session, {
        empreendimentoId: empreendimento.id,
        ...folder,
      }),
    );

    expect(material).toEqual({
      id: expect.any(String),
      empreendimentoId: empreendimento.id,
      nome: folder.nome,
      tipoDeArquivo: "pdf",
      destino: "lote",
      contentType: "application/pdf",
      tamanho: pdf.byteLength,
      enviadoEm: new Date("2026-10-23T10:00:00-03:00"),
    });
    const chave = `imobiliarias/${imobiliaria.id}/empreendimentos/${empreendimento.id}/materiais/${material.id}`;
    expect(arquivos.get(chave)).toEqual({
      bytes: pdf,
      contentType: "application/pdf",
    });
    expect(
      await listarMateriaisDeMarketing(
        sessaoDe(bruno, imobiliaria),
        empreendimento.id,
      ),
    ).toEqual([material]);
    expect(await urlDoMaterial(session, material.id)).toStartWith(
      `fake://${chave}?exp=`,
    );
  });

  test("reenviar o mesmo formulário (mesmo id) não duplica nem grava de novo", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const input = {
      id: crypto.randomUUID(),
      empreendimentoId: empreendimento.id,
      ...folder,
    };

    const [a, b] = await Promise.all([
      enviarMaterialDeMarketing(session, input),
      enviarMaterialDeMarketing(session, input),
    ]);

    expect(a).toEqual(b);
    expect(
      await listarMateriaisDeMarketing(session, empreendimento.id),
    ).toHaveLength(1);
    expect(arquivos.size).toBe(1);
  });

  test("remover apaga o registro e o arquivo; repetir devolve false", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const material = ok(
      await enviarMaterialDeMarketing(session, {
        empreendimentoId: empreendimento.id,
        ...folder,
      }),
    );
    expect(arquivos.size).toBe(1);

    expect(await removerMaterialDeMarketing(session, material.id)).toBe(true);
    expect(arquivos.size).toBe(0);
    expect(
      await listarMateriaisDeMarketing(session, empreendimento.id),
    ).toEqual([]);
    expect(await removerMaterialDeMarketing(session, material.id)).toBe(false);
  });

  test("materiaisPara devolve o material certo para lote e para lote + casa", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const enviar = (nome: string, destino: DestinoDoMaterial) =>
      enviarMaterialDeMarketing(session, {
        empreendimentoId: empreendimento.id,
        ...folder,
        nome,
        destino,
      });
    const soLote = ok(await enviar("Só lote", "lote"));
    const soCasa = ok(await enviar("Só casa", "lote_e_casa"));
    const ambos = ok(await enviar("Ambos", "ambos"));

    expect(
      (await materiaisPara(session, empreendimento.id, "lote")).map(
        (m) => m.id,
      ),
    ).toEqual([ambos.id, soLote.id]);
    expect(
      (await materiaisPara(session, empreendimento.id, "lote_e_casa")).map(
        (m) => m.id,
      ),
    ).toEqual([ambos.id, soCasa.id]);
  });

  test("corretor de outra imobiliária não vê, não remove e não envia", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const material = ok(
      await enviarMaterialDeMarketing(session, {
        empreendimentoId: empreendimento.id,
        ...folder,
      }),
    );
    const concorrente = (await criarConcorrente()).session;

    expect(
      await listarMateriaisDeMarketing(concorrente, empreendimento.id),
    ).toEqual([]);
    expect(await urlDoMaterial(concorrente, material.id)).toBeNull();
    expect(await removerMaterialDeMarketing(concorrente, material.id)).toBe(
      false,
    );
    expect(
      await enviarMaterialDeMarketing(concorrente, {
        empreendimentoId: empreendimento.id,
        ...folder,
      }),
    ).toBeNull();
    expect(arquivos.size).toBe(1);
    expect(
      listarMateriaisDeMarketing({ role: "administrador" }, empreendimento.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
