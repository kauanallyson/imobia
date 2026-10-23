# 05: Base de conhecimento (RAG)

**What to build:** Um corretor escreve a base de conhecimento de cada empreendimento. Ao salvar, o texto é quebrado em trechos e indexado com embeddings (`text-embedding-3-small`) em pgvector. Uma busca por pergunta devolve os trechos mais relevantes, sempre filtrada pela imobiliária, pronta para ser usada como ferramenta do assistente.

**Blocked by:** 03 (Catálogo: empreendimentos, lotes e modelos de casa)

**Status:** ready-for-agent

- [ ] Corretor cria e edita a base de conhecimento de um empreendimento
- [ ] Salvar reindexa os trechos; editar não deixa trechos antigos órfãos
- [ ] Busca devolve trechos relevantes do empreendimento pedido
- [ ] Busca nunca devolve trechos de outra imobiliária (teste dedicado)
- [ ] Embeddings passam pelo adaptador `LLM` (`LLMFake` em testes)
