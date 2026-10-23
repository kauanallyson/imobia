# CRM imobiliário

Vocabulário em `GLOSSARY.md`, decisões em `docs/adr/`, spec do MVP em `docs/specs/mvp/`.

## Desenvolvimento

```bash
bun install
systemctl --user start podman.socket   # `podman compose` precisa do socket
podman compose up -d postgres          # Postgres 17 + pgvector
bun run db:migrate
bun dev
```

## Testes

```bash
bun run test
```

`bun test` cria (ou reinicia) o container Podman `crm-postgres-test` na porta 5433, com dados em tmpfs, e aplica as migrations antes de rodar. Para usar outro Postgres com pgvector, defina `TEST_DATABASE_URL`.

Testes exercitam os casos de uso do domínio (`src/domain/`) com os repositórios Drizzle reais contra Postgres e os adaptadores externos falsos (`src/adapters/<porta>/fake.ts`). Use `withRollback` (`src/test/database.ts`) para isolar os dados de cada teste (testes de concorrência, que precisam de várias conexões, criam uma imobiliária nova por teste em vez disso) e `createTestDomain` (`src/test/domain.ts`) para obter o domínio e os falsos. Veja `src/domain/imobiliarias/imobiliarias.test.ts` como referência.

## Arquitetura

O domínio declara portas em `src/domain/ports/` e não importa Drizzle, Next.js nem SDKs. `src/db/repositories/` e `src/adapters/` implementam as portas, e `src/server/container.ts` (`getDomain()`) monta tudo para a aplicação. A camada `src/app` chega ao domínio só por `src/server`. As fronteiras são verificadas pelo `biome check` (`noRestrictedImports`). Detalhes em ADR-0005 e na seção Arquitetura da spec.

Nomes: termos do `GLOSSARY.md` em pt-BR; pastas, padrões e adaptadores em inglês (ADR-0003).
