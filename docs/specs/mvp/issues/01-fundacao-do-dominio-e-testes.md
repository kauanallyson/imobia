# 01: Fundação do domínio e harness de testes

**What to build:** A base para todos os outros tickets. A tabela de tutorial `users` sai e entra um schema com **imobiliária** desde o primeiro dia (ADR-0001). Ganham forma o módulo de domínio como única porta de entrada para regras de negócio, as interfaces dos adaptadores (WhatsApp, LLM, Agenda, Armazenamento, Relógio) com implementações falsas em memória, e o `bun test` rodando contra Postgres 17 com pgvector em container Podman. Um teste real e verde (por exemplo, criar uma imobiliária e lê-la pelo módulo de domínio) serve de referência para os demais.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] A tabela `users` de tutorial foi removida e há migration com a tabela de imobiliárias
- [x] O Postgres de desenvolvimento/teste tem a extensão pgvector habilitada
- [x] Existe um módulo de domínio com nomes em pt-BR (ADR-0003) usado pelo teste de referência
- [x] As interfaces dos cinco adaptadores existem, cada uma com implementação falsa em memória
- [x] `bun test` sobe/usa o Postgres em Podman e passa, com cada teste isolando seus dados
- [x] Há um script no package.json para rodar os testes

## Comments

**Implementado (2026-10-23).** Domínio em `dominio/` (`criarDominio`), adaptadores com falsos em `adaptadores/`, harness em `test/` (preload em `bunfig.toml`). O socket do Podman não estava ativo, então `bun test` gerencia o próprio container (`crm-postgres-test`, porta 5433, tmpfs) via `podman run` em vez de `podman compose`; `TEST_DATABASE_URL` aponta para outro Postgres. Isolamento padrão por transação revertida (`withRollback`); testes de concorrência (reserva) devem usar uma imobiliária nova por teste. Não havia migration anterior, então não há `DROP TABLE users`.

**Atualização (2026-10-23).** Código movido para `src/`, com pastas e padrões em inglês (ADR-0003 atualizado): `src/domain` (`createDomain`), `src/adapters` (`WhatsApp`, `LLM`, `Calendar`, `Storage`, `Clock` e os `*Fake`), `src/test` (`withRollback`, `createTestDomain`).

**Atualização (2026-10-23).** Refatorado para o desenho do ADR-0005: portas em `src/domain/ports` (`ImobiliariaRepository`, `Clock`, `WhatsAppConnection`/`WhatsAppMessenger`, `LLM`, `Calendar`, `Storage`), casos de uso `criarImobiliaria`/`buscarImobiliaria` recebendo um `Ator`, repositório Drizzle em `src/db/repositories`, falsos em `src/adapters/<porta>/fake.ts`, raiz de composição `server-only` em `src/server/container.ts` e fronteiras de import verificadas pelo Biome. A porta `Transaction` fica para o primeiro caso de uso que precisar de atomicidade. Variáveis de ambiente validadas com zod em `src/server/env.ts`, importado por `next.config.ts` e `drizzle.config.ts`.
