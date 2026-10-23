# 09: Assistente: primeiro atendimento

**What to build:** Quando um cliente novo manda mensagem, o assistente do corretor responde na hora: apresenta-se como "assistente virtual do(a) {corretor}", diz que é IA se perguntado, pergunta se o interesse é lote ou lote + casa, envia o material de marketing certo e responde dúvidas usando a base de conhecimento. O negócio vai para Em atendimento. Usa `gpt-6-luna` pela Responses API com tool calling; toda ação passa por ferramentas que chamam funções de `src/data`. Sem resposta na base, o assistente diz que vai verificar (a criação da pendência vem no ticket de pendências).

**Blocked by:** 04 (Planos de pagamento e material de marketing), 05 (Base de conhecimento (RAG)), 08 (Funil de negócios)

**Status:** ready-for-agent

- [ ] Mensagem de número novo recebe resposta do assistente com a apresentação correta
- [ ] Escolha entre lote e lote + casa leva ao envio do material de marketing correspondente
- [ ] Dúvidas são respondidas a partir da busca na base de conhecimento
- [ ] O negócio passa de Novo para Em atendimento
- [ ] O assistente só age por ferramentas que chamam funções de `src/data`
- [ ] Testes usam LLM e WhatsApp falsos roteirizados: chega mensagem → ferramentas surtem efeito → mensagens saem
- [ ] A mesma mensagem recebida duas vezes gera uma única resposta do assistente
