# loteAI

CRM imobiliário com assistente no WhatsApp.

Vocabulário em `GLOSSARY.md`, decisões em `docs/adr/`, spec do MVP em `docs/specs/mvp/`.

## Desenvolvimento

```bash
bun install
systemctl --user start podman.socket   # `podman compose` precisa do socket
podman compose up -d postgres          # Postgres 17 + pgvector
cp .env.example .env                   # preencha BETTER_AUTH_SECRET
bun run db:migrate
bun run admin:create <email> <senha> <nome>   # primeiro administrador
bun dev
```

Não há cadastro público. O administrador entra em `/admin`, cria imobiliárias e corretores; corretores entram em `/login` e caem em `/painel`.

## Testes

```bash
bun run test
```

`bun test` cria (ou reinicia) o container Podman `crm-postgres-test` na porta 5433, com dados em tmpfs, e aplica as migrations antes de rodar. Para usar outro Postgres com pgvector, defina `TEST_DATABASE_URL`.

Os testes chamam as funções de `src/data` contra um Postgres real; as tabelas são limpas antes de cada teste. Integrações externas são trocadas por falsos com `mock.module` e o tempo com `setSystemTime`. Veja `src/data/imobiliarias.test.ts` como referência.

## Arquitetura

Next.js simples (ADR-0006):
- `src/app` tem as rotas e as Server Actions.
- `src/data` é a Data Access Layer: regras de negócio, consultas Drizzle e permissão.
- `src/lib` tem a infraestrutura: envs com zod, o db, o Better Auth (`auth.ts`) e as integrações.

Interface com MUI (tema claro), ícones Lucide nos botões e fonte Tuffy. Formulários de criação levam um `id` gerado pelo servidor, então reenviar não duplica registros.

Nomes: termos do `GLOSSARY.md` em pt-BR; pastas e nomes técnicos em inglês (ADR-0003).
