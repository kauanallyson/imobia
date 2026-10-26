# Número novo decidido pelo histórico da Evolution e por contatos conhecidos

A história 24 pede que o assistente só responda números que nunca falaram com o corretor. O banco do loteAI não basta: o histórico anterior ao pareamento não é importado (`syncFullHistory: false`), e a primeira mensagem `fromMe` para um número sem conversa não cria cliente, então a resposta dele pareceria de um número novo.

Na primeira mensagem de um número sem conversa, `receberMensagem` consulta a Evolution (`temHistoricoAnterior`, `POST /chat/findMessages`) por outra mensagem com aquele contato além da atual. Havendo histórico, ou sendo a mensagem `fromMe` (o corretor puxou a conversa), o número entra em `contatos_conhecidos` (corretor + telefone, com o motivo) e nada é gravado. Mensagens seguintes de um contato conhecido são ignoradas sem nova consulta. Se a Evolution não responder, nada é gravado nem marcado, e a próxima mensagem consulta de novo.

## Consequências

- Um contato conhecido nunca vira cliente sozinho; o corretor segue a conversa pelo próprio celular.
- Cliente cadastrado à mão sempre vence: a primeira mensagem (dele ou `fromMe`) abre a conversa nesse cliente, sem consultar a Evolution nem marcar contato conhecido; sem negócio, abre um em Novo.
- A consulta acontece dentro da transação que serializa o número (advisory lock); a Evolution lenta atrasa só aquele número.
- Falha da Evolution na primeira mensagem perde o atendimento automático dessa mensagem; preferimos isso a falar com família ou clientes antigos.
