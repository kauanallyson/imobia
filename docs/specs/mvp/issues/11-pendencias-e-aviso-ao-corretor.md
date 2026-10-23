# 11: Pendências e aviso ao corretor

**What to build:** O assistente cria pendências quando não encontra a resposta na base de conhecimento ou quando o cliente pede uma pessoa (nesse caso também pausa a conversa). O corretor vê a lista de pendências no CRM e resolve cada uma pelo celular. Para cada pendência, um número de sistema (instância Evolution própria) manda ao corretor uma mensagem no WhatsApp com link, respeitando 8h–20h exceto para tipos urgentes.

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** ready-for-agent

- [ ] Pergunta sem resposta na base cria pendência e o assistente avisa o cliente que vai verificar
- [ ] Pedido de falar com uma pessoa cria pendência urgente e pausa o assistente
- [ ] Lista de pendências no CRM, com resolução pelo celular
- [ ] Aviso no WhatsApp do corretor via número de sistema, com link para a pendência
- [ ] Avisos não urgentes fora de 8h–20h esperam a próxima janela (teste com `setSystemTime`)
- [ ] Resolver uma pendência já resolvida não muda nada; cada pendência gera um único aviso
