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

Testes exercitam o módulo de domínio (`src/domain/`) com Postgres real e adaptadores falsos (`src/adapters/`). Use `withRollback` (`src/test/database.ts`) para isolar os dados de cada teste (testes de concorrência, que precisam de várias conexões, criam uma imobiliária nova por teste em vez disso) e `createTestDomain` (`src/test/domain.ts`) para obter o domínio e os falsos. Veja `src/domain/imobiliarias.test.ts` como referência.

Nomes: termos do `GLOSSARY.md` em pt-BR; pastas, padrões e adaptadores em inglês (ADR-0003).
