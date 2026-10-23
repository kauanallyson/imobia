import { describe, expect, test } from "bun:test";
import { auth } from "@/lib/auth";
import { administrador, criarAna } from "@/test/fixtures";
import {
  criarCorretor,
  desativarCorretor,
  listarCorretores,
} from "./corretores";
import { criarImobiliaria } from "./imobiliarias";
import { ForbiddenError, type Session } from "./session";
import { DuplicateEmailError } from "./users";

const corretorOf = (imobiliariaId: string): Session => ({
  role: "corretor",
  corretorId: crypto.randomUUID(),
  imobiliariaId,
});

function entrar(email: string, password: string) {
  return auth.api.signInEmail({ body: { email, password } });
}

describe("corretores", () => {
  test("o administrador cria um corretor que entra com e-mail e senha", async () => {
    await criarAna();

    const result = await entrar("ana@fiel.com.br", "senha-forte-123");
    expect(result.user.name).toBe("Ana Souza");
  });

  test("um corretor desativado não consegue entrar", async () => {
    const { corretor } = await criarAna();

    await desativarCorretor(administrador, corretor.id);

    await expect(entrar("ana@fiel.com.br", "senha-forte-123")).rejects.toThrow(
      "Conta desativada",
    );
  });

  test("o administrador lista só os corretores da imobiliária pedida", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const outra = await criarImobiliaria(administrador, {
      nome: "Concorrente",
    });
    await criarCorretor(administrador, {
      imobiliariaId: outra.id,
      nome: "Bruno Lima",
      email: "bruno@concorrente.com.br",
      senha: "senha-forte-123",
    });
    await desativarCorretor(administrador, corretor.id);

    const found = await listarCorretores(administrador, imobiliaria.id);

    expect(found).toEqual([
      {
        id: corretor.id,
        nome: "Ana Souza",
        email: "ana@fiel.com.br",
        ativo: false,
      },
    ]);
  });

  test("um corretor não cria, não lista e não desativa corretores", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = corretorOf(imobiliaria.id);

    await expect(
      criarCorretor(session, {
        imobiliariaId: imobiliaria.id,
        nome: "Carla",
        email: "carla@fiel.com.br",
        senha: "senha-forte-123",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      listarCorretores(session, imobiliaria.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      desativarCorretor(session, corretor.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("não é possível criar dois corretores com o mesmo e-mail", async () => {
    const { imobiliaria } = await criarAna();

    await expect(
      criarCorretor(administrador, {
        imobiliariaId: imobiliaria.id,
        nome: "Outra Ana",
        email: "ANA@fiel.com.br",
        senha: "senha-forte-123",
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  test("senha errada não entra", async () => {
    await criarAna();

    await expect(
      entrar("ana@fiel.com.br", "senha-errada-123"),
    ).rejects.toThrow();
  });

  test("desativar um corretor inexistente retorna null", async () => {
    expect(
      await desativarCorretor(administrador, crypto.randomUUID()),
    ).toBeNull();
  });

  test("repetir a criação com o mesmo id não duplica o corretor", async () => {
    const { imobiliaria } = await criarAna();
    const input = {
      id: crypto.randomUUID(),
      imobiliariaId: imobiliaria.id,
      nome: "Bruno Lima",
      email: "bruno@fiel.com.br",
      senha: "senha-forte-123",
    };

    const first = await criarCorretor(administrador, input);
    const again = await criarCorretor(administrador, input);

    expect(again).toEqual(first);
    expect(await listarCorretores(administrador, imobiliaria.id)).toHaveLength(
      2,
    );
  });

  test("envios simultâneos com o mesmo id criam um só corretor", async () => {
    const { imobiliaria } = await criarAna();
    const input = {
      id: crypto.randomUUID(),
      imobiliariaId: imobiliaria.id,
      nome: "Bruno Lima",
      email: "bruno@fiel.com.br",
      senha: "senha-forte-123",
    };

    const [first, second] = await Promise.all([
      criarCorretor(administrador, input),
      criarCorretor(administrador, input),
    ]);

    expect(second).toEqual(first);
    expect(await listarCorretores(administrador, imobiliaria.id)).toHaveLength(
      2,
    );
  });

  test("criar corretor numa imobiliária inexistente retorna null", async () => {
    const found = await criarCorretor(administrador, {
      imobiliariaId: crypto.randomUUID(),
      nome: "Bruno Lima",
      email: "bruno@fiel.com.br",
      senha: "senha-forte-123",
    });

    expect(found).toBeNull();
  });
});
