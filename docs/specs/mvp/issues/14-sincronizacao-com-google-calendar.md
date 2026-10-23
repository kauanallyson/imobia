# 14: Sincronização com Google Calendar

**What to build:** O corretor conecta a conta Google por OAuth. Os horários livres passam a ser a disponibilidade do CRM menos os compromissos do Google Calendar. Cada visita agendada vira um evento no calendário do corretor. Se o corretor mover ou apagar o evento no Google, o sistema atualiza a visita e o assistente avisa o cliente (oferecendo novo horário quando apagado). Corretor sem Google continua usando só a disponibilidade do CRM (a obrigatoriedade ainda está em aberto).

**Blocked by:** 13 (Visitas com disponibilidade do CRM)

**Status:** ready-for-agent

- [ ] Corretor conecta e desconecta o Google Calendar
- [ ] Horários oferecidos excluem compromissos do Google
- [ ] Visita agendada cria evento com cliente, empreendimento e telefone
- [ ] Evento movido atualiza a visita e avisa o cliente; evento apagado cancela e oferece novo horário
- [ ] Sem Google conectado, o fluxo de visitas continua funcionando
- [ ] Testes usam o `CalendarFake`
