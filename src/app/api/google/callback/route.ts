import type { NextRequest } from "next/server";
import { concluirConexaoGoogle } from "@/data/google-calendar";
import { sessionFromHeaders } from "@/data/session";
import { env } from "@/lib/env";

// Callback do OAuth do Google (o outro Route Handler previsto na spec). O
// corretor precisa estar logado e o `state` precisa ser o que ele mesmo
// gerou em /painel/agenda (ligado à conta, válido por 10 minutos).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const session = await sessionFromHeaders(request.headers);
  if (session?.role !== "corretor") {
    return Response.redirect(new URL("/login", env.APP_URL));
  }
  const conectado =
    !params.get("error") &&
    (await concluirConexaoGoogle(session, {
      code: params.get("code") ?? "",
      state: params.get("state") ?? "",
    }));
  const destino = new URL("/painel/agenda", env.APP_URL);
  destino.searchParams.set("google", conectado ? "conectado" : "erro");
  return Response.redirect(destino);
}
