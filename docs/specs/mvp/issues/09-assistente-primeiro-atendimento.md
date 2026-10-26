# 09: Assistente: primeiro atendimento

**What to build:** Quando um cliente novo manda mensagem, o assistente do corretor responde na hora: apresenta-se como "assistente virtual do(a) {corretor}", diz que é IA se perguntado, pergunta se o interesse é lote ou lote + casa, envia o material de marketing certo e responde dúvidas usando a base de conhecimento. O negócio vai para Em atendimento. Usa `gpt-6-luna` pela Responses API com tool calling; toda ação passa por ferramentas que chamam funções de `src/data`. Sem resposta na base, o assistente diz que vai verificar (a criação da pendência vem no ticket de pendências).

**Blocked by:** 04 (Planos de pagamento e material de marketing), 05 (Base de conhecimento (RAG)), 08 (Funil de negócios)

**Status:** done

- [x] Mensagem de número novo recebe resposta do assistente com a apresentação correta
- [x] Escolha entre lote e lote + casa leva ao envio do material de marketing correspondente
- [x] Dúvidas são respondidas a partir da busca na base de conhecimento
- [x] O negócio passa de Novo para Em atendimento
- [x] O assistente só age por ferramentas que chamam funções de `src/data`
- [x] Testes usam LLM e WhatsApp falsos roteirizados: chega mensagem → ferramentas surtem efeito → mensagens saem
- [x] A mesma mensagem recebida duas vezes gera uma única resposta do assistente

## Comments

- `src/lib/llm.ts` ganhou `responder({ instrucoes, historico, ferramentas, respostaAnterior? })` sobre a Responses API (`gpt-6-luna`, `store: true` + `previous_response_id` para devolver os `function_call_output`). O falso (`src/test/fakes/llm.ts`) roteiriza rodadas com `roteirizar({ tipo: "chamadas", chamadas: [...] }, { tipo: "texto", texto })` e guarda cada pedido em `pedidos` para inspeção.
- Registro de ferramentas em `src/data/assistente/ferramentas.ts`: cada uma é `{ nome, descricao, parametros (zod → JSON Schema), executar(contexto, args) }` e só chama funções de `src/data` com a sessão do corretor; argumentos inválidos/ferramenta desconhecida voltam como `{ erro }` para o modelo. Ferramentas deste ticket: `listar_empreendimentos`, `buscar_base_de_conhecimento`, `enviar_material_de_marketing`, `registrar_interesse`, `mudar_etapa` (só `em_atendimento` por ora). Tickets seguintes acrescentam entradas em `ferramentas` e seções em `prompt.ts`.
- Empreendimento do atendimento: o informado pelo modelo → o já registrado no negócio (`negocios.empreendimento_interesse_id`, novo) → o do lote de interesse → o único da imobiliária; sem candidato, a ferramenta pede ao modelo que use `listar_empreendimentos`. Novo também `negocios.interesse` (`lote | lote_e_casa`).
- Orquestração em `src/data/assistente.ts` (`atenderMensagem(conversaId)`), acionada por `receberMensagem` só quando a mensagem do cliente foi gravada pela primeira vez (reentrega = sem resposta). Falha do modelo é logada e não derruba o webhook. O texto final sai pelo WhatsApp e é gravado com autor `assistente` e `fromMe: true` (o id da Evolution evita duplicar quando o eco do envio chegar pelo webhook; o ticket 10 deve pausar só em `fromMe` com autor `corretor`). Novo → Em atendimento acontece após a primeira resposta, com autor `assistente`.
- Sem resposta na base, o prompt manda dizer que vai verificar; a pendência fica para o ticket 11 (TODO na ferramenta). Nada de pausa, orçamento ou visitas aqui.
- O webhook aguarda o atendimento antes do 200 (aceitável no MVP; mover para o worker se a latência virar problema).
