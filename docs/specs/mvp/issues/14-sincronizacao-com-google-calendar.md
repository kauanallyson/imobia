# 14: Sincronização com Google Calendar

**What to build:** O corretor pode conectar a conta Google por OAuth. Quando conectado, os horários livres são a disponibilidade do CRM menos os compromissos do Google Calendar e cada visita agendada vira um evento no calendário do corretor. Se o corretor mover ou apagar o evento no Google, o sistema atualiza a visita e o assistente avisa o cliente (oferecendo novo horário quando apagado). Google Calendar é opcional; sem conexão, o corretor usa só a disponibilidade do CRM.

**Blocked by:** 13 (Visitas com disponibilidade do CRM)

**Status:** done

- [x] Corretor conecta e desconecta o Google Calendar
- [x] Horários oferecidos excluem compromissos do Google
- [x] Visita agendada cria evento com cliente, empreendimento e telefone
- [x] Evento movido atualiza a visita e avisa o cliente; evento apagado cancela e oferece novo horário
- [x] Sem Google conectado, o fluxo de visitas continua funcionando
- [x] Testes usam um Calendar falso (`mock.module`)
- [x] Repetir a sincronização não cria evento duplicado no Google Calendar

## Comments

- `src/lib/calendar.ts` é o único módulo que importa `googleapis`; o falso em memória (`src/test/fakes/calendar.ts`) entra pelo preload. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` são opcionais: sem elas a agenda mostra que a integração não está configurada e tudo segue só com o CRM. Callback: `APP_URL/api/google/callback`.
- Tabela `google_calendar_conexoes` (uma linha por corretor): tokens, `calendarId` (`primary`), `syncToken` e o `state` do OAuth (gerado por `iniciarConexaoGoogle`, válido 10 min, consumido no callback, que exige a sessão do mesmo corretor).
- `horariosLivres` desconta o freebusy do Google quando conectado; Google fora do ar → só CRM (log). `exigirHorarioLivre` continua só com o CRM: o corretor pode marcar por cima de um compromisso do Google de propósito, e o freebusy não diferencia o próprio evento da visita ao remarcar.
- `refletirVisitaNoGoogle` leva o evento ao estado da visita (agendar/remarcar/alterar local → cria/atualiza; cancelar → apaga). O id do evento é o uuid da visita sem hífens, então repetir a criação não duplica (409 vira atualização). Falha do Google só vai para o log.
- Job `google-calendar` (`src/data/sincronizar-google-calendar.ts`): `events.list` com syncToken (410 → sincronização completa). Evento movido → visita Remarcada no novo horário; apagado → Cancelada com até 3 horários livres oferecidos. Updates condicionais garantem um único aviso; o aviso usa `enviarTextoAoCliente` (respeita opt-out) e fica na conversa. Cliente sem conversa ou sem WhatsApp pareado: só a visita muda.
- Push notifications (`events.watch`) ficaram para depois do MVP; o worker faz polling a cada minuto.
