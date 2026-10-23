import { describe, expect, test } from "bun:test";
import { auth } from "@/lib/auth";
import { administrador, criarAna } from "@/test/fixtures";
import { criarAdministrador } from "./administradores";
import { desativarCorretor } from "./corretores";
import { sessionFromHeaders } from "./session";

// Entra e devolve os headers de um request seguinte, com o cookie de sessão.
async function entrar(email: string, password: string) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const cookie = headers.getSetCookie().map((c) => c.split(";")[0]);
  return new Headers({ cookie: cookie.join("; ") });
}

describe("sessão do request", () => {
  test("o corretor que entrou ganha a sessão escopada à sua imobiliária", async () => {
    const { imobiliaria, corretor } = await criarAna();

    const headers = await entrar("ana@fiel.com.br", "senha-forte-123");

    expect(await sessionFromHeaders(headers)).toEqual({
      role: "corretor",
      corretorId: corretor.id,
      imobiliariaId: imobiliaria.id,
    });
  });

  test("desativar o corretor encerra a sessão aberta", async () => {
    const { corretor } = await criarAna();
    const headers = await entrar("ana@fiel.com.br", "senha-forte-123");

    await desativarCorretor(administrador, corretor.id);

    expect(await sessionFromHeaders(headers)).toBeNull();
  });

  test("o administrador entra e ganha a sessão de administrador", async () => {
    await criarAdministrador({
      nome: "Kauan",
      email: "admin@crm.com.br",
      senha: "senha-forte-123",
    });

    const headers = await entrar("admin@crm.com.br", "senha-forte-123");

    expect(await sessionFromHeaders(headers)).toEqual({
      role: "administrador",
    });
  });

  test("sem cookie não há sessão", async () => {
    expect(await sessionFromHeaders(new Headers())).toBeNull();
  });
});
