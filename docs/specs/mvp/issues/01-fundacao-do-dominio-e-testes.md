# 01: Fundação do domínio e harness de testes

**What to build:** A base para todos os outros tickets. A tabela de tutorial `users` sai e entra um schema com **imobiliária** desde o primeiro dia (ADR-0001). Ganham forma o módulo de domínio como única porta de entrada para regras de negócio, as interfaces dos adaptadores (WhatsApp, LLM, Agenda, Armazenamento, Relógio) com implementações falsas em memória, e o `bun test` rodando contra Postgres 17 com pgvector em container Podman. Um teste real e verde (por exemplo, criar uma imobiliária e lê-la pelo módulo de domínio) serve de referência para os demais.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] A tabela `users` de tutorial foi removida e há migration com a tabela de imobiliárias
- [x] O Postgres de desenvolvimento/teste tem a extensão pgvector habilitada
- [x] Existe uma Data Access Layer (`src/data`) com nomes do glossário em pt-BR (ADR-0003) usada pelo teste de referência
- [x] ~~As interfaces dos cinco adaptadores existem, cada uma com implementação falsa em memória~~ Revisado pelo ADR-0006: cada integração (`src/lib/<serviço>.ts`) e seu falso (`src/test/fakes/`, via `mock.module`) entram no ticket que a usa; o tempo é controlado com `setSystemTime`
- [x] `bun test` sobe/usa o Postgres em Podman e passa, com cada teste isolando seus dados
- [x] Há um script no package.json para rodar os testes

## Comments

**Implementado (2026-10-23).** Estado final, depois de duas revisões de arquitetura (ADR-0005, substituído pelo ADR-0006):

- **Código:** DAL em `src/data/imobiliarias.ts` (`criarImobiliaria`, `buscarImobiliaria`, que recebem uma `Session`). Infraestrutura em `src/lib`: `env.ts` com zod, importado por `next.config.ts` e `drizzle.config.ts`; `db/`.
- **Testes:** `bun test` gerencia o próprio container (`crm-postgres-test`, porta 5433, tmpfs) via `podman run`, porque o socket do Podman não estava ativo e `podman compose` falhava. As migrations são aplicadas no preload, as tabelas são limpas antes de cada teste e `server-only` é trocado por um módulo vazio.
- **Migrations:** não havia migration anterior, então não há `DROP TABLE users`.
