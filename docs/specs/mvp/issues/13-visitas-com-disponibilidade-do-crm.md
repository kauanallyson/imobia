# 13: Visitas com disponibilidade do CRM

**What to build:** O corretor cadastra disponibilidade semanal e datas bloqueadas. O assistente oferece horários livres ao cliente e agenda a visita direto, no endereço do empreendimento, enviando a localização na confirmação; o corretor pode alterar o local. O negócio vai para Visita agendada. Este ticket cria o **worker** de jobs agendados, que envia lembretes ao cliente e ao corretor no dia anterior e na manhã da visita; o cliente pode remarcar. "Fechar agora" pula a visita e leva a Coletando dados.

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** ready-for-agent

- [ ] Corretor cadastra janelas semanais e datas bloqueadas
- [ ] Horários oferecidos ficam só dentro da disponibilidade e sem conflito com outras visitas
- [ ] Agendamento cria a visita com local padrão do empreendimento, envia localização e move o negócio para Visita agendada
- [ ] Corretor altera o local de uma visita
- [ ] Worker envia lembretes no dia anterior e na manhã da visita (teste com Relógio falso)
- [ ] Cliente remarca e a visita é atualizada
- [ ] "Fechar agora" leva o negócio direto a Coletando dados
