# 05: Base de conhecimento (RAG)

**What to build:** Um corretor escreve a base de conhecimento de cada empreendimento. Ao salvar, o texto é quebrado em trechos e indexado com embeddings (`text-embedding-3-small`) em pgvector. Uma busca por pergunta devolve os trechos mais relevantes, sempre filtrada pela imobiliária, pronta para ser usada como ferramenta do assistente.

**Blocked by:** 03 (Catálogo: empreendimentos, lotes e modelos de casa)

**Status:** done

- [x] Corretor cria e edita a base de conhecimento de um empreendimento
- [x] Salvar reindexa os trechos; editar não deixa trechos antigos órfãos
- [x] Busca devolve trechos relevantes do empreendimento pedido
- [x] Busca nunca devolve trechos de outra imobiliária (teste dedicado)
- [x] Embeddings passam por `src/lib/llm.ts` (falso em testes)

## Comments

- **Onde fica**: texto integral em `empreendimentos.base_de_conhecimento`; trechos em `trechos_de_conhecimento` (`empreendimento_id`, `imobiliaria_id` desnormalizado para a busca filtrar sem join, `ordem`, `texto`, `embedding vector(1536)` com índice HNSW de cosseno). A migration repete `create extension if not exists vector` (idempotente).
- **Chunking** (`dividirEmTrechos`, pura e testada): parágrafos agrupados até ~800 caracteres; título markdown (`# …`) sempre abre trecho novo; parágrafo maior que o limite é partido por frases.
- **Salvar** (`salvarBaseDeConhecimento`) troca texto e trechos numa transação (delete + insert), então editar nunca deixa órfão; texto vazio limpa a base. **Buscar** (`buscarNaBaseDeConhecimento`) devolve `{ texto, distancia }[]` ordenado por `cosineDistance`, sempre filtrado por `imobiliaria_id` da sessão e pelo empreendimento; empreendimento de outra imobiliária → `null`.
- **`src/lib/llm.ts`** é o único módulo com o SDK `openai` (`OPENAI_API_KEY`). Só `gerarEmbeddings` está implementado; os tipos de `responder`/`transcrever` ficam marcados com TODO para os tickets 09 e 19. O falso `src/test/fakes/llm.ts` gera embeddings determinísticos por hash de palavras (textos parecidos ficam próximos) e já tem fila de respostas roteirizadas (`roteirizar`/`proximaResposta`).
- **UI**: `/painel/catalogo/empreendimentos/[id]/conhecimento` com o editor (textarea) e um formulário "Testar pergunta" que mostra os 3 trechos mais próximos com a distância — útil para o corretor conferir o que o assistente vai encontrar.
