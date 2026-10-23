"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { homePath, type Session } from "@/data/session";
import { auth } from "@/lib/auth";

// O React limpa o formulário após a action; o e-mail volta como defaultValue.
export type SignInState = { erro?: string; email?: string };

const signInSchema = z.object({
  email: z.email(),
  senha: z.string().min(1),
});

export async function signIn(
  _: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const input = signInSchema.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!input.success) return { erro: "Informe e-mail e senha.", email };

  let role: Session["role"];
  try {
    const result = await auth.api.signInEmail({
      body: { email: input.data.email, password: input.data.senha },
      headers: await headers(),
    });
    role = result.user.role as Session["role"];
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return {
      erro:
        error.status === "FORBIDDEN"
          ? "Sua conta está desativada."
          : "E-mail ou senha incorretos.",
      email,
    };
  }
  redirect(homePath(role));
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
