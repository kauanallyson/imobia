import { describe, expect, setSystemTime, test } from "bun:test";
import * as fake from "@/test/fakes/whatsapp";
import {
  administrador,
  conectarWhatsappDaAna,
  criarAna,
  sessaoDe,
} from "@/test/fixtures";
import { ForbiddenError } from "./session";
import {
  aceitarRiscoDoWhatsapp,
  atualizarEstadoDaConexao,
  buscarConexaoDoWhatsapp,
  gerarQrCode,
} from "./whatsapp";

describe("conexão do WhatsApp", () => {
  test("sem aceite registrado, não é possível gerar o QR code", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);

    expect(await buscarConexaoDoWhatsapp(session)).toBeNull();
    expect(await gerarQrCode(session)).toBeNull();
    expect(fake.instancias.size).toBe(0);
  });

  test("o aceite fica registrado com data e hora; aceitar de novo não duplica", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    setSystemTime(new Date("2026-10-23T10:00:00-03:00"));

    const first = await aceitarRiscoDoWhatsapp(session);
    setSystemTime(new Date("2026-10-24T10:00:00-03:00"));
    const again = await aceitarRiscoDoWhatsapp(session);

    expect(first.aceiteEm).toEqual(new Date("2026-10-23T10:00:00-03:00"));
    expect(again).toEqual(first);
    expect(await buscarConexaoDoWhatsapp(session)).toEqual({
      aceiteEm: new Date("2026-10-23T10:00:00-03:00"),
      instancia: null,
      estado: "desconectado",
    });
  });

  test("com aceite, o QR code é exibido e, após o pareamento, o estado é conectado", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    await aceitarRiscoDoWhatsapp(session);

    const qr = await gerarQrCode(session);
    expect(qr?.base64).toStartWith("data:image/png;base64,");
    expect((await buscarConexaoDoWhatsapp(session))?.estado).toBe("conectando");

    // A Evolution avisa pelo webhook quando o celular lê o QR.
    await atualizarEstadoDaConexao(qr?.instancia ?? "", "open");
    expect((await buscarConexaoDoWhatsapp(session))?.estado).toBe("conectado");
  });

  test("queda de conexão aparece e um novo QR code permite reconectar", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();

    await atualizarEstadoDaConexao(instancia, "close");
    expect((await buscarConexaoDoWhatsapp(session))?.estado).toBe(
      "desconectado",
    );

    fake.simularEstado(instancia, "close");
    const qr = await gerarQrCode(session);
    expect(qr?.instancia).toBe(instancia);
    expect(qr?.base64).toBeDefined();
    expect((await buscarConexaoDoWhatsapp(session))?.estado).toBe("conectando");
  });

  test("gerar o QR de novo com o WhatsApp já pareado não cria outra instância", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();

    const qr = await gerarQrCode(session);

    expect(qr).toMatchObject({ instancia, estado: "conectado" });
    expect(qr?.base64).toBeUndefined();
    expect(fake.instancias.size).toBe(1);
  });

  test("estado de instância desconhecida é ignorado", async () => {
    expect(await atualizarEstadoDaConexao("nao-existe", "open")).toBeNull();
  });

  test("o administrador não tem conexão de WhatsApp", async () => {
    await expect(aceitarRiscoDoWhatsapp(administrador)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(buscarConexaoDoWhatsapp(administrador)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
