# 10: Corretor assume a conversa, pausa e opt-out

**What to build:** Quando o corretor responde pelo celular (`fromMe`), o assistente pausa naquela conversa. O corretor devolve a conversa ao assistente com um toque, ou ela é retomada automaticamente após 24h sem mensagem dele (verificado pelo worker). O corretor liga ou desliga o assistente por conversa. Se o cliente disser que não tem interesse, o assistente para de vez, nunca mais envia mensagem e o negócio vai para Perdido com motivo "sem interesse".

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** ready-for-agent

- [ ] Mensagem `fromMe` pausa o assistente na conversa; mensagens seguintes do cliente não recebem resposta automática
- [ ] "Devolver ao assistente" reativa a conversa
- [ ] Após 24h sem mensagem do corretor, o assistente retoma (teste com `ClockFake`)
- [ ] Ligar/desligar por conversa funciona e desligado não retoma sozinho
- [ ] Opt-out impede qualquer envio futuro e leva o negócio a Perdido com motivo "sem interesse"
