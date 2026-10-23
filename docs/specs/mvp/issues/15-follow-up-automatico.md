# 15: Follow-up automático

**What to build:** O worker faz follow-up com clientes que pararam de responder durante o atendimento: 1, 3 e 7 dias após a última mensagem do cliente e depois a cada 2 semanas, até 90 dias de silêncio, quando o negócio vira "silencioso" (aberto, sem envios) e aparece num filtro no funil. Cada follow-up é escrito pelo assistente a partir da conversa. Envios só entre 8h e 20h, de segunda a sábado. Conversas pausadas pelo corretor não recebem follow-up; o corretor recebe lembrete. Nenhum negócio vai para Perdido automaticamente.

**Blocked by:** 10 (Corretor assume a conversa, pausa e opt-out), 13 (Visitas com disponibilidade do CRM)

**Status:** ready-for-agent

- [ ] Cadência 1d / 3d / 7d / a cada 2 semanas, contada da última mensagem do cliente (teste com `setSystemTime`)
- [ ] Resposta do cliente reinicia a contagem
- [ ] Após 90 dias sem resposta, envios param e o negócio aparece no filtro de silenciosos
- [ ] Nada é enviado fora de 8h–20h ou aos domingos; o envio vai para a próxima janela
- [ ] Conversa pausada não recebe follow-up e o corretor é lembrado
- [ ] Opt-out e conversas desligadas nunca recebem follow-up
- [ ] O conteúdo do follow-up é gerado com o contexto da conversa (falso em testes)
