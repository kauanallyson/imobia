# 13: Visitas com disponibilidade do CRM

**What to build:** O corretor cadastra disponibilidade semanal e datas bloqueadas. O assistente oferece horários livres ao cliente apenas até o fim da semana corrente (segunda a domingo, horário de Brasília), em visitas de 60 minutos, e agenda direto; se não houver horário nessa semana, orienta o cliente a falar com o corretor. A visita fica no endereço do empreendimento, com localização enviada na confirmação; o corretor pode alterar o local. O negócio vai para Visita agendada. Este ticket cria o **worker** de jobs agendados, que envia lembretes ao cliente e ao corretor no dia anterior e na manhã da visita; o cliente pode remarcar. "Fechar agora" pula a visita e leva a Coletando dados.

**Blocked by:** 09 (Assistente: primeiro atendimento)

**Status:** done

- [x] Corretor cadastra janelas semanais e datas bloqueadas
- [x] Horários oferecidos ficam só dentro da disponibilidade, sem conflito com outras visitas, duram 60 minutos e não ultrapassam o fim da semana corrente
- [x] Sem horário disponível na semana corrente, o assistente orienta o cliente a falar com o corretor
- [x] Agendamento cria a visita com local padrão do empreendimento, envia localização e move o negócio para Visita agendada
- [x] Corretor altera o local de uma visita
- [x] Worker envia lembretes no dia anterior e na manhã da visita (teste com `setSystemTime`)
- [x] Cliente remarca e a visita é atualizada
- [x] "Fechar agora" leva o negócio direto a Coletando dados
- [x] Rodar o worker de novo no mesmo horário não reenvia lembretes

## Comments

**2026-10-23 (aprendizados do 02):** o worker (`src/worker/`) importa `src/data`, que usa `server-only`: rode-o com `bun --conditions=react-server`, como o script `admin:create`. Cada lembrete precisa de chave única (visita + tipo de lembrete) no banco.
