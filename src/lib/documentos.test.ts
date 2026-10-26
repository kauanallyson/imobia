import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import { gerados } from "@/test/fakes/documentos";
import { criarDocx } from "@/test/fixtures";
import {
  gerarPdf,
  lerCampos,
  ModeloInvalidoError,
  preencherModelo,
} from "./documentos";

// O preload troca src/lib/documentos.ts pelo falso, mas o falso reaproveita
// o preenchimento real (só a conversão para PDF é falsa): estes testes
// exercitam o DOCX de verdade.

const textoDe = (docx: Uint8Array, parte = "word/document.xml") =>
  new TextDecoder()
    .decode(unzipSync(docx)[parte])
    .replace(/<[^>]+>/g, "")
    .trim();

describe("documentos: modelo DOCX", () => {
  test("substitui placeholders inteiros e quebrados em vários runs", () => {
    const modelo = criarDocx([
      "Cliente: {cliente_nome}",
      // O Word costuma partir o placeholder em runs separados.
      ["CPF: {cliente", "_c", "pf} – fim"],
      "Lote {lote_quadra}-{lote_numero} & cia",
    ]);
    const preenchido = preencherModelo(modelo, {
      cliente_nome: "Carlos <Lima>",
      cliente_cpf: "123.456.789-09",
      lote_quadra: "A",
      lote_numero: "1",
    });
    expect(textoDe(preenchido)).toBe(
      "Cliente: Carlos &lt;Lima&gt;CPF: 123.456.789-09 – fimLote A-1 &amp; cia",
    );
  });

  test("placeholder sem valor fica como está, para o corretor ver na revisão", () => {
    const modelo = criarDocx(["Plano: {plano} {desconhecido}"]);
    expect(textoDe(preencherModelo(modelo, { plano: "60x" }))).toBe(
      "Plano: 60x {desconhecido}",
    );
  });

  test("cabeçalho e rodapé também são preenchidos", () => {
    const modelo = criarDocx(["corpo"], {
      cabecalho: "Proposta de {cliente_nome}",
    });
    expect(
      textoDe(
        preencherModelo(modelo, { cliente_nome: "Ana" }),
        "word/header1.xml",
      ),
    ).toBe("Proposta de Ana");
  });

  test("lista os campos do modelo, inclusive quebrados", () => {
    const modelo = criarDocx(["{data}", ["{lote", "_numero}"], "{data}"]);
    expect(lerCampos(modelo)).toEqual(["data", "lote_numero"]);
  });

  test("arquivo que não é DOCX é recusado", () => {
    expect(() => lerCampos(new TextEncoder().encode("não sou docx"))).toThrow(
      ModeloInvalidoError,
    );
  });

  test("o falso de gerarPdf registra os campos e devolve bytes de PDF", async () => {
    const pdf = await gerarPdf(criarDocx(["{plano}"]), { plano: "60x" });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(gerados.at(-1)?.campos).toEqual({ plano: "60x" });
    expect(gerados.at(-1)?.texto).toContain("60x");
  });
});
