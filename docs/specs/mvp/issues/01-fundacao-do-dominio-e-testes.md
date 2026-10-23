# 01: Fundação do domínio e harness de testes

**What to build:** A base para todos os outros tickets. A tabela de tutorial `users` sai e entra um schema com **imobiliária** desde o primeiro dia (ADR-0001). Ganham forma o módulo de domínio como única porta de entrada para regras de negócio, as interfaces dos adaptadores (WhatsApp, LLM, Agenda, Armazenamento, Relógio) com implementações falsas em memória, e o `bun test` rodando contra Postgres 17 com pgvector em container Podman. Um teste real e verde (por exemplo, criar uma imobiliária e lê-la pelo módulo de domínio) serve de referência para os demais.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A tabela `users` de tutorial foi removida e há migration com a tabela de imobiliárias
- [ ] O Postgres de desenvolvimento/teste tem a extensão pgvector habilitada
- [ ] Existe um módulo de domínio com nomes em pt-BR (ADR-0003) usado pelo teste de referência
- [ ] As interfaces dos cinco adaptadores existem, cada uma com implementação falsa em memória
- [ ] `bun test` sobe/usa o Postgres em Podman e passa, com cada teste isolando seus dados
- [ ] Há um script no package.json para rodar os testes
