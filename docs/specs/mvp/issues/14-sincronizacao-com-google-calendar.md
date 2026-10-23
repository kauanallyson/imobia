# 14: Sincronização com Google Calendar

**What to build:** O corretor pode conectar a conta Google por OAuth. Quando conectado, os horários livres são a disponibilidade do CRM menos os compromissos do Google Calendar e cada visita agendada vira um evento no calendário do corretor. Se o corretor mover ou apagar o evento no Google, o sistema atualiza a visita e o assistente avisa o cliente (oferecendo novo horário quando apagado). Google Calendar é opcional; sem conexão, o corretor usa só a disponibilidade do CRM.

**Blocked by:** 13 (Visitas com disponibilidade do CRM)

**Status:** ready-for-agent

- [ ] Corretor conecta e desconecta o Google Calendar
- [ ] Horários oferecidos excluem compromissos do Google
- [ ] Visita agendada cria evento com cliente, empreendimento e telefone
- [ ] Evento movido atualiza a visita e avisa o cliente; evento apagado cancela e oferece novo horário
- [ ] Sem Google conectado, o fluxo de visitas continua funcionando
- [ ] Testes usam um Calendar falso (`mock.module`)
- [ ] Repetir a sincronização não cria evento duplicado no Google Calendar
